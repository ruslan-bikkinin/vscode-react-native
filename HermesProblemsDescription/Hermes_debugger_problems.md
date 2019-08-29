# Hermes debugger problems

- The debugger doesn’t react on break points located into constructor functions (For example, into “App” function or user’s component constructor).
  <br/>The debugger reacts only when an user clicks a button or others UI elements which have event handlers.

  |Enable Hermes|Disable Hermes|
  |---|---|
  |<img src="./images/Screen Shot 2019-08-21 at 09.58.49.png" alt="drawing"/>|<img src="./images/Screen Shot 2019-08-21 at 09.54.08.png" alt="drawing"/>|
  |<img src="./images/Screen Shot 2019-08-21 at 09.59.46.png" alt="drawing"/>|<img src="./images/Screen Shot 2019-08-21 at 09.57.08.png" alt="drawing"/>|

- The debugger doesn’t show Global, Closure variables. The debugger provides only Local variables (function scope).
- The debugger doesn’t show value of numeric variables.
- The debugger shows additional VM_unknown calls in Call Stack.
  <br/>The debugger displays all the calls as well as Google Chrome, but also adds unknown calls.
- The debugger doesn’t provide properties containing in “this” object.
- The debugger doesn’t provide complete object data (For example, Date object, Map object - there is only an object name without internal data).
  <br/> If an object contains an array the debugger doesn't display the object's data.

  |Enable Hermes|Disable Hermes|Chrome|
  |---|---|---|
  |<img src="./images/Screen Shot 2019-08-21 at 10.12.43.png" alt="drawing"/>|<img src="./images/Screen Shot 2019-08-21 at 10.15.21.png" alt="drawing"/>|<img src="./images/Screen Shot 2019-08-21 at 13.23.51.png" alt="drawing"/>|
  ||<img src="./images/Screen Shot 2019-08-21 at 10.32.53.png" alt="drawing"/>|<img src="./images/Screen Shot 2019-08-21 at 13.37.18.png" alt="drawing"/>|
  |<img src="./images/Screen Shot 2019-08-21 at 13.09.15.png" alt="drawing"/>|<img src="./images/Screen Shot 2019-08-21 at 13.11.37.png" alt="drawing"/>|<img src="./images/Screen Shot 2019-08-21 at 13.04.02.png" alt="drawing"/>|

- The debugger doesn’t show local variables, if there is any array definition in a handler function.
  <br/>The debugger remove local variables data only when it comes an array definition.

  |Enable Hermes|Disable Hermes|Chrome|
  |---|---|---|
  |Before the array definition: <br/><img src="./images/Screen Shot 2019-08-21 at 11.06.10.png" alt="drawing"/>|<img src="./images/Screen Shot 2019-08-21 at 11.03.19.png" alt="drawing"/>|<img src="./images/Screen Shot 2019-08-21 at 13.15.22.png" alt="drawing"/>|
  |After the array definition: <br/><img src="./images/Screen Shot 2019-08-21 at 11.07.51.png" alt="drawing"/>|||

## Debugging in Google Chrome
- There aren't Local variables.
  <img src="./images/Screen Shot 2019-08-21 at 10.23.16.png" alt="drawing"/>