const {
  NEVER,
  Observable,
  catchError,
  concatMap,
  from,
  scan,
  map,
  of,
  tap,
  lastValueFrom,
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
  }) =>
  (source$) =>
    executeSideEffects({ id, sideEffects })(
      executeOperator({
        operator: deferredPromiseFn
          ? liftToObvervable(deferredPromiseFn)
          : operator
            ? operator
            : none,
        deferredPromiseFn,
      })
    )(source$);

const executeOperator =
  ({ operator }) =>
  (source$) => {
    return new Observable((subscriber) =>
      source$
        .pipe(
          concatMap((value) =>
            of(value).pipe(
              operator,
              catchError((error)=> throwError(error))
            )
          )
        )
        .subscribe({
          next: (value) => subscriber.next(value),
          error: (error) => subscriber.error(error),
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
  ({ id, sideEffects }, target$, source$) =>
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

            return of(value)
          }),
          target$,
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
            R.tap((error) =>
              sideEffects?.forEach(
                ({ onError }) => onError && onError(id, error, latestValue$.getValue())
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
