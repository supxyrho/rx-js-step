const R = require("ramda");

const { of, tap, interval, map } = require("rxjs");

const { step } = require("./rx-js-step");

// of("test 1 - onBefore, onAfter")
//   .pipe(
//     tap(() => console.log("tap")),
//     step({
//       id: "test",
//       operator: tap(console.log),
//       sideEffects: [
//         {
//           onBefore: (value) => console.log("onBefore", value),
//           onAfter: (value) => console.log("onAfter", value),
//         },
//       ],
//       interceptors: [],
//     })
//   )
//   .subscribe();

  of("test 2 - onError")
  .pipe(
    step({
      id: "test",
      operator: (source$)=> source$.pipe(
        map(()=> {throw new Error("error_____")}),
      ),
      sideEffects: [
        {
          onError:(id, error, value)=> console.log("onError", id,  value, error),
        },
      ],
      interceptors: [],
    })
  )
  .subscribe({
    next: (value) => console.log("next subscribe", value),
    error: (error) => console.log("error subscribe", error),
    complete: () => console.log("complete subscribe"),
  });
