const R = require("ramda");

const { of, tap, interval } = require("rxjs");

const { step } = require("./rx-js-step");

of("test")
  .pipe(
    tap(() => console.log("tap")),
    step({
      id: "test",
      operator: tap(console.log),
      sideEffects: [
        {
          onBefore: (value) => console.log("onBefore", value),
          onAfter: (value) => console.log("onAfter", value),
        },
      ],
      interceptors: [],
    })
  )
  .subscribe();
