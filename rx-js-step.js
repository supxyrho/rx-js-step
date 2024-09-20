/* eslint-disable require-jsdoc */


/* eslint-disable @typescript-eslint/ban-types */
const {
  iif,
  Observable,
  catchError,
  concatMap,
  from,
  map,
  of,
  queueScheduler,
  tap,
  throwError,
  BehaviorSubject,
} = require('rxjs');
const {observeOn} = require('rxjs/operators');

const R = require('ramda');

const step =
  ({
    id = null,
    operator = null,
    deferredPromiseFn = null,
    sideEffects = null,
    interceptor = null,
    skipUpstreamErrorOnSideEffects = true,
    skipUpstreamErrorOnInterceptor = true,
    skipWhen = null,
  }) =>
    (source$) => source$.pipe(
        concatMap((value) =>
          iif(
              () => skipWhen && skipWhen(value),
              of(value),
              of(value).pipe(
                  executeInterceptorOnBefore({id, interceptor}),
                  executeSideEffectsOnBefore({id, sideEffects}),
                  executeSideEffectsOnError({id, sideEffects, skipUpstreamErrorOnSideEffects})(
                      executeInterceptorOnError({id, interceptor, skipUpstreamErrorOnInterceptor})(
                          executeOperator({
                            id,
                            operator:
                              operator ??
                              deferredPromiseToOperator({deferredPromiseFn}) ??
                              throwInvalidOperatorError,
                          }),
                      ),
                  ),

                  executeInterceptorOnAfter({id, interceptor}),
                  executeSideEffectsOnAfter({id, sideEffects}),
              ),
          ),
        ),
    );

const executeOperator = R.curry(
    ({id, operator}, source$) =>
      new Observable((subscriber) =>
        source$
            .pipe(
                concatMap((value) =>
                  of(value).pipe(
                      operator,
                      catchError((error) => throwError(new CustomError(id, error))),
                  ),
                ),
            ).subscribe(subscriber),
      ),
);

const deferredPromiseToOperator = R.curry(
    ({deferredPromiseFn}, source$) =>
      new Observable((subscriber) =>
        source$
            .pipe(concatMap((value) => from(deferredPromiseFn(value))))
            .subscribe(subscriber),
      ),
);

const throwInvalidOperatorError = R.curry(
    (source$) =>
      new Observable((subscriber) =>
        source$
            .pipe(
                map(() =>
                  throwError(
                      new Error('operator or deferredPromiseFn is not valid prop'),
                  ),
                ),
            )
            .subscribe({
              error: (err) => {
                subscriber.error(err);
              },
            }),
      ),
);

const executeSideEffectsOnBefore = R.curry(
    ({id, sideEffects}, source$) =>
      new Observable((subscriber) =>
        source$.pipe(
            tap((value) =>
              sideEffects?.forEach(
                  ({onBefore}) => onBefore && onBefore(id, value),
              ),
            ),
        ).subscribe(subscriber),
      ),
);

const executeSideEffectsOnAfter = R.curry(
    ({id, sideEffects}, source$) =>
      new Observable((subscriber) =>
        source$.pipe(
            tap((value) =>
              sideEffects?.forEach(
                  ({onAfter}) => onAfter && onAfter(id, value),
              ),
            ),
        ).subscribe(subscriber),
      ),
);

const executeSideEffectsOnError = R.curry(
    ({id, sideEffects, skipUpstreamErrorOnSideEffects}, target$, source$) => {
      const latestValue$ = new BehaviorSubject(null);

      return new Observable((subscriber) =>
        source$.pipe(
            concatMap((value) => {
              latestValue$.next(value);

              return of(value).pipe(
                  target$,
                  tap(
                      R.identity,
                      R.tap(
                          R.ifElse(
                              (error) =>
                                skipUpstreamErrorOnSideEffects ||
                                error instanceof CustomError &&
                                error.id !== id,
                              (error) => subscriber.error(error),
                              (error) =>
                                sideEffects?.forEach(
                                    ({onError}) =>
                                      onError && onError(id, error, latestValue$.getValue()),
                                ),
                          ),
                      ),
                  ),
              );
            }),
        ).subscribe(subscriber),
      );
    });

const executeInterceptorOnBefore = R.curry(
    ({id, interceptor}, source$) =>
      new Observable((subscriber) =>
        source$.pipe(
            map((value) => (interceptor?.onBefore && interceptor.onBefore(id, value)) ?? value),
        ).subscribe(subscriber),
      ),
);

const executeInterceptorOnAfter = R.curry(
    ({id, interceptor}, source$) =>
      new Observable((subscriber) =>
        source$.pipe(
            map((value) => (interceptor?.onAfter && interceptor?.onAfter(id, value)) ?? value),
        ).subscribe(subscriber),
      ),
);

const executeInterceptorOnError = R.curry(
    ({id, interceptor, skipUpstreamErrorOnInterceptor}, target$, source$) => {
      const latestValue$ = new BehaviorSubject(null);

      return new Observable((subscriber) =>
        source$.pipe(
            observeOn(queueScheduler),
            concatMap((value) => {
              latestValue$.next(value);

              return of(value)
                  .pipe(
                      target$,
                  );
            }),
        ).subscribe({
          next: (value) => subscriber.next(value),
          complete: () => subscriber.complete(),
          error: (error) => {
            let result = null;

            if (
              skipUpstreamErrorOnInterceptor ||
              error instanceof CustomError &&
              error.id !== id
            ) {
              return subscriber.error(error);
            } else if (interceptor?.onError) {
              try {
                result = interceptor.onError(
                    id,
                    error,
                    latestValue$.getValue(),
                );
                return subscriber.next(result);
              } catch (error) {
                return subscriber.error(error);
              }
            }

            return subscriber.error(error);
          },
        }),
      );
    },
);

module.exports = {step};

class CustomError extends Error {
  id = null;
  constructor(id, message) {
    super(message);
    this.id = id;
    this.name = 'CustomError';
    Error.captureStackTrace(this, this.constructor);
  }
}
