const R = require("ramda");

const { of, tap, interval, map } = require("rxjs");

const { step } = require("./rx-js-step");
const { on } = require("events");

 
// of("___A___")
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


  // of("____B_____")
  // .pipe(
  //   step({
  //     id: "test",
  //     operator: (source$)=> source$.pipe(
  //       map(()=> {throw new Error("error 1_____")}),
  //     ),
  //     sideEffects: [
  //       {
  //         onError:(id, error, value)=> console.log("onError 1 ", id,  value, error),
  //       },
  //     ],
  //     interceptors: [],
  //   }),
  //   step({
  //     id: "test-2",
  //     operator: (source$)=> source$.pipe(
  //       map(()=> {throw new Error("error 2_____")}),
  //     ),
  //     // interceptors: [
  //     //   {onBefore: (value)=> value, onAfter: (value)=> value, onError: (error)=> error},
  //     // ],
  //     // skipUpstreamErrorOnSideEffects:true,
  //     interceptors: [],
  //   })
  // )
  // .subscribe({
  //   next: (value) => console.log("next subscribe", value),
  //   error: (error) => console.log("error subscribe", error),
  //   complete: () => console.log("complete subscribe"),
  // });

    // skipUpstreamErrorOnSideEffects true 테스트
    of("____C_____")
    .pipe(
      step({
        id: "test",
        operator: (source$)=> source$.pipe(
          map(()=> {throw new Error("error 1_____")}),
        ),
        interceptor: {
            onBefore: (id, value)=> {
              console.log('__onBefore', id, value);
              return 'd'
            }, 
            onAfter: (id, value)=> console.log('__onAfter', id, value),
            onError: (id, error, acc)=> { 
              console.log('__onError', id, error, acc)
              return 'error-d'
            },
        }
      }),
    )
    .subscribe({
      next: (value) => console.log("next subscribe", value),
      error: (error) => console.log("error subscribe", error),
      complete: () => console.log("complete subscribe"),
    });
