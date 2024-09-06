const {
  NEVER,
  Observable,
  catchError,
  concatMap,
  from,
  map,
  of,
  tap,
  throwError,
  BehaviorSubject,
} = require("rxjs");
const R = require("ramda");

const step =
  ({
    id = null,
    operator = null,
    deferredPromiseFn = null,
    sideEffects = null,
    interceptor = null,
    skipUpstreamErrorOnSideEffects = false,
    skipUpstreamErrorOnInterceptor = false,
  }) =>
  (source$) =>
    executeInterceptor({ id, interceptor, skipUpstreamErrorOnInterceptor })(
      executeSideEffects({ id, sideEffects, skipUpstreamErrorOnSideEffects })(
        executeOperator({
          id,
          operator:
            operator ??
            deferredPromiseToObservable({ deferredPromiseFn }) ??
            throwInvalidOperatorError,
          deferredPromiseFn,
        })
      )
    )(source$);

const executeOperator = R.curry(
  ({ id, operator }, source$) =>
    new Observable((subscriber) =>
      source$
        .pipe(
          concatMap((value) => {
            return of(value).pipe(
              operator,
              catchError((error) => throwError(new CustomError(id, error)))
            );
          })
        )
        .subscribe(subscriber)
    )
);

const deferredPromiseToObservable = R.curry(
  ({ deferredPromiseFn }, source$) => {
    return new Observable((subscriber) =>
      source$
        .pipe(concatMap((value) => from(deferredPromiseFn(value))))
        .subscribe(subscriber)
    );
  }
);

const throwInvalidOperatorError = R.curry(
  (source$) =>
    new Observable((subscriber) =>
      source$
        .pipe(
          map(() =>
            throwError(
              new error("operator or deferredPromiseFn is not valid prop")
            )
          )
        )
        .subscribe({
          error: (err) => {
            subscriber.error(err);
          },
        })
    )
);

// @TODO: onBefore과 onAfter, onError 두 부분으로 나눈다.
const executeSideEffects = R.curry(
  ({ id, sideEffects, skipUpstreamErrorOnSideEffects }, target$, source$) =>
    new Observable((subscriber) => {
      const latestValue$ = new BehaviorSubject(null);

      return source$
        .pipe(
          tap((value) =>
            sideEffects?.forEach(
              ({ onBefore }) => onBefore && onBefore(id, value)
            )
          ),
          concatMap((value) => {
            latestValue$.next(value);

            return of(value).pipe(target$);
          }),
          tap(
            // next on tap
            R.pipe(
              R.when(
                isNotNever,
                R.tap((value) =>
                  sideEffects?.forEach(
                    ({ onAfter }) => onAfter && onAfter(id, value)
                  )
                )
              ),
              R.tap((value) => subscriber.next(value))
            ),
            // error on tap
            R.tap(
              R.ifElse(
                (error) =>
                  error instanceof CustomError &&
                  skipUpstreamErrorOnSideEffects &&
                  error.id !== id,
                (error) => subscriber.error(error),
                (error) =>
                  sideEffects?.forEach(
                    ({ onError }) =>
                      onError && onError(id, error, latestValue$.getValue())
                  )
              )
            )
          )
        )
        .subscribe({
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
    })
);

// @TODO: onBefore과 onAfter, onError 두 부분으로 나눈다.
const executeInterceptor = R.curry(
  ({ id, interceptor, skipUpstreamErrorOnInterceptor }, target$, source$) =>
    new Observable((subscriber) => {
      const latestValue$ = new BehaviorSubject(null);

      return source$
        .pipe(
          concatMap((value) => {
            let nextValue = null;
            if (interceptor?.onBefore) {
              nextValue = interceptor.onBefore(id, value);
            } else {
              nextValue = value;
            }

            latestValue$.next(nextValue);

            return of(nextValue).pipe(
              catchError((error) => throwError(new CustomError(id, error)))
            );
          }),
          target$
        )
        .subscribe({
          next: (value) => {
            let nextValue = null;
            if (interceptor?.onAfter) {
              nextValue = interceptor.onAfter(id, value);
            } else {
              nextValue = value;
            }

            subscriber.next(nextValue);
          },
          error: (error) => {
            let nextError = null;

            if (
              error instanceof CustomError &&
              skipUpstreamErrorOnInterceptor &&
              error.id !== id
            ) {
              nextError = error;
            } else if (interceptor?.onError) {
              nextError = interceptor.onError(
                id,
                error,
                latestValue$.getValue()
              );
            } else {
              nextError = error;
            }

            subscriber.error(nextError);
          },
          complete: () => subscriber.complete(),
        });
    })
);

module.exports = { step };

const isNotNever = R.complement(R.equals(NEVER));

class CustomError extends Error {
  id = null;
  constructor(id, message) {
    super(message);
    this.id = id;
    this.name = "CustomError";
    Error.captureStackTrace(this, this.constructor);
  }
}
