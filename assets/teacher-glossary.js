/* Glossary for the "?" word chips in teacher mode.
   key: the words that trigger the chip (matched in what the teacher says)
   term: the chip label · def: the explanation (also recorded as audio) */
window.BFZ_GLOSSARY = [
  { key: ['client'], term: 'Client', def: 'A client is whatever sends a request to a server: a browser, a phone app, or Postman.' },
  { key: ['server'], term: 'Server', def: 'A server is a program that waits for requests and sends back answers. Your backend is a server.' },
  { key: ['request'], term: 'Request', def: 'A request is the message a client sends to a server. It has a method, like GET, a URL, and sometimes a body.' },
  { key: ['response'], term: 'Response', def: 'A response is the answer the server sends back. It has a status code and usually some JSON.' },
  { key: ['route'], term: 'Route', def: 'A route connects a method and a path, like GET slash users, to the function that should run.' },
  { key: ['router'], term: 'Router', def: 'A router is a mini app that holds all the routes for one topic, like users or trips.' },
  { key: ['controller'], term: 'Controller', def: 'A controller is the function that does the real work for a route: it checks the input, talks to the database, and sends the response.' },
  { key: ['status code', 'four oh four', 'two hundred'], term: 'Status code', def: 'A status code is a three digit number in every response. Two hundreds mean success, four hundreds mean the client made a mistake, five hundreds mean the server did.' },
  { key: ['json'], term: 'JSON', def: 'JSON is the text format APIs use to send data. It looks like a JavaScript object, but keys and text need double quotes.' },
  { key: ['express'], term: 'Express', def: 'Express is a package that makes it easy to build a server in Node: you add routes, and it runs your functions.' },
  { key: ['node'], term: 'Node.js', def: 'Node is the program that runs JavaScript outside the browser. It is what runs your server.' },
  { key: ['npm', 'package', 'packages'], term: 'npm', def: 'npm downloads packages, which is code other people wrote, like Express. They go in the node modules folder.' },
  { key: ['terminal'], term: 'Terminal', def: 'The terminal is a window where you type commands, like node server dot js, instead of clicking.' },
  { key: ['postman'], term: 'Postman', def: 'Postman is an app for sending test requests to your server: GET, POST, PUT and DELETE, with a JSON body.' },
  { key: ['port'], term: 'Port', def: 'A port is the door number your server listens at, like three thousand or five thousand. One program per port.' },
  { key: ['variable', 'variables'], term: 'Variable', def: 'A variable is a box with a name that holds a value. Use const if it never changes, and let if it can change.' },
  { key: ['array', 'arrays'], term: 'Array', def: 'An array is a list of values in order, written with square brackets. Counting starts at zero.' },
  { key: ['object', 'objects'], term: 'Object', def: 'An object groups details about one thing, as keys and values in curly braces. One database row becomes one object.' },
  { key: ['function', 'functions', 'arrow function', 'arrow functions'], term: 'Function', def: 'A function is a recipe: steps with a name that you can run any time. It can take inputs and return an output.' },
  { key: ['destructuring'], term: 'Destructuring', def: 'Destructuring is a short way to take values out of an object or an array and put them into variables.' },
  { key: ['try catch', 'try and catch'], term: 'try / catch', def: 'Try catch runs code that might fail. If it throws an error, the catch block runs instead of crashing the program.' },
  { key: ['promise'], term: 'Promise', def: 'A promise is like a ticket for a result that is not ready yet, for example rows from the database.' },
  { key: ['await', 'async'], term: 'async / await', def: 'Await waits for a promise to finish and gives you its result. You can only use await inside an async function.' },
  { key: ['database', 'mysql'], term: 'Database', def: 'A database stores your data in tables, so it is still there after the server restarts. We use MySQL.' },
  { key: ['table', 'tables'], term: 'Table', def: 'A table is like a spreadsheet: columns are the kinds of information, and rows are the items.' },
  { key: ['primary key'], term: 'Primary key', def: 'The primary key is the column that identifies each row, usually ID. It never repeats.' },
  { key: ['foreign key'], term: 'Foreign key', def: 'A foreign key is a column that holds the ID of a row in another table, like the user ID in a review.' },
  { key: ['select', 'where'], term: 'SELECT … WHERE', def: 'SELECT reads rows from a table. WHERE keeps only the rows that match a condition.' },
  { key: ['join', 'inner join', 'left join'], term: 'JOIN', def: 'A join glues matching rows from two tables together. Inner join keeps only matches; left join keeps every row from the left table.' },
  { key: ['placeholder', 'placeholders', 'question mark'], term: 'Placeholder ?', def: 'A question mark in SQL is a placeholder. MySQL fills it in safely with a value, so user text can never become SQL.' },
  { key: ['sql injection', 'injection'], term: 'SQL injection', def: 'SQL injection is an attack where someone types SQL into a form field, because the code glued their text into a query.' },
  { key: ['dot env'], term: '.env', def: 'The dot env file holds secrets and settings, like the database password. It must never be uploaded.' },
  { key: ['hash', 'hashing', 'bcrypt'], term: 'Hash (bcrypt)', def: 'Hashing turns a password into scrambled text that cannot be turned back. bcrypt compare checks a typed password against it.' },
  { key: ['validate', 'validation', 'sanitize'], term: 'Validate', def: 'Validate means check that the input is acceptable. Sanitize means clean it up, like trimming spaces and lowercasing an email.' },
  { key: ['cookie', 'cookies'], term: 'Cookie', def: 'A cookie is a small note the server gives the browser. The browser sends it back automatically with every next request.' },
  { key: ['crud'], term: 'CRUD', def: 'CRUD stands for create, read, update and delete: the four things almost every app does with data.' },
  { key: ['module dot exports', 'require', 'export'], term: 'require / exports', def: 'module dot exports is what a file shares. require takes it into another file. Dot slash means the same folder.' },
];

/* Fixed lines the teacher says (also recorded) */
window.BFZ_LINES = {
  praise: ['Great job! That is exactly right.', 'Yes! All correct. Well done.', 'Perfect, you got it!', 'Excellent work. On to the next step.'],
  finish: 'Well done! Now close teacher mode and try the practice yourself.',
};
