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
  BehaviorSubject
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
    executeSideEffects({ id, sideEffects, skipUpstreamErrorOnSideEffects})(
      executeOperator({
        id,
        interceptor,
        skipUpstreamErrorOnInterceptor,
        operator: deferredPromiseFn
          ? liftToObvervable(deferredPromiseFn)
          : operator
            ? operator
            : none,
        deferredPromiseFn,
      })
    )(source$);

const executeOperator =
  ({ id, interceptor, skipUpstreamErrorOnInterceptor, operator }) =>
  (source$) => {
    const latestValue$ = new BehaviorSubject(null);

    return new Observable((subscriber) =>
      source$
        .pipe(
          concatMap((value)=> {

            let nextValue = null
            if(interceptor.onBefore){
              nextValue = interceptor.onBefore(id, value)
            } else {
              nextValue = value
            }

            latestValue$.next(nextValue)

            return of(nextValue).pipe(
                  operator,
                  catchError((error)=> throwError(new CustomError(error)))
            )
          })
        )
        .subscribe({
          next: (value) => { 
            let nextValue = null 
            if(interceptor.onAfter){
                nextValue = interceptor.onAfter(id, value)
            } else {
                nextValue = value
            }

            
            subscriber.next(nextValue)
          },
          error: (error) => { 
            let nextError = null
            if(interceptor.onError && !skipUpstreamErrorOnInterceptor){
              nextError = interceptor.onError(id, error, latestValue$.getValue())
            } else {
              nextError = error
            }

            subscriber.error(nextError) },
          complete: () => subscriber.complete(),
        })
    );
  };

const liftToObvervable = (deferredPromiseFn) => (source$) => {
  return new Observable((subscriber) =>
    source$
      .pipe(concatMap((value) => from(deferredPromiseFn(value))))
      .subscribe(subscriber)
  );
};

const none = (source$) =>
  new Observable((subscriber) =>
    source$
      .pipe(
        map(() => throwError(new Error("operator or deferredPromiseFn is not valid prop")))
      )
      .subscribe(subscriber)
  );

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

            return of(value).pipe(target$)
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
                (error) => error instanceof CustomError && skipUpstreamErrorOnSideEffects,
                ()=> subscriber.error(error),
                (error) => sideEffects?.forEach(
                  ({ onError }) => onError && onError(id, error, latestValue$.getValue())
                )
              )
            )
          )
        )
        .subscribe({
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        })
    })
  
);

module.exports = { step };

const isNotNever = R.complement(R.equals(NEVER));

class CustomError extends Error{ 
  constructor(message ){
    super(message);
    this.name = "CustomError";
    Error.captureStackTrace(this, this.constructor);
  }
}