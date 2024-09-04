const {
  NEVER,
  Observable,
  catchError,
  concatMap,
  from,
  map,
  of,
  tap,
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
              catchError((err) => {
                throw err;
              })
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
        map(() => new Error("operator or deferredPromiseFn is not valid prop"))
      )
      .subscribe(subscriber)
  );

const executeSideEffects = R.curry(
  ({ id, sideEffects }, target$, source$) =>
    new Observable((subscriber) =>
      source$
        .pipe(
          tap((value) =>
            sideEffects?.forEach(
              ({ onBefore }) => onBefore && onBefore(id, value)
            )
          ),
          target$,
          tap(
            // next
            R.pipe(
              R.when(
                isNotNever(value),
                R.tap((value) =>
                  sideEffects?.forEach(
                    ({ onAfter }) => onAfter && onAfter(id, value)
                  )
                )
              ),
              R.tap((value) => subscriber.next(value))
            ),
            // error
            R.tap((error) =>
              sideEffects?.forEach(
                ({ onError }) => onError && onError(id, error)
              )
            )
          )
        )
        .subscribe({
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        })
    )
);

const linkStreamFactory = ({ emit }) =>
  R.curry(({ id, extractId, onNext }, el) =>
    R.tap((el) =>
      emit(extractId ? extractId(el) : id, onNext ? onNext(el) : el)
    )(el)
  );

const stepLoggerFactory = (services, settings) => settings(services);

class customError extends Error {
  constructor({ message = "undefined", description = "undefined", data = {} }) {
    super(message);

    this.name = "rx-js-step stream error ";
    this.originMessage = message;
    this.description = description;
    this.data = data;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, customError);
    }
  }

  isSame(err) {
    return (
      this.name === err.name &&
      this.message === err.message &&
      this.description === err.description
    );
  }
}

module.exports = { step };

const isNotNever = R.complement(R.equals(NEVER));
