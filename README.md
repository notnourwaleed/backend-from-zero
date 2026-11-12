# Backend from Zero

A hands-on learning site for backend JavaScript: Node.js, Express and MySQL.
Each chapter explains one idea in simple words, then you practise it with quizzes, fill-in-the-blanks, code playgrounds and a SQL playground that run in the browser.

## Chapters

0. Set up your computer (VS Code, terminal, Node.js, npm, MySQL, Postman)
1. The JavaScript you need
2. How the web works
3. Your first Express server
4. Routes & controllers
5. Async & MySQL
6. SQL basics
7. Security & login
8. JOINs & cookies
9. Build it from zero (+ project planner)
10. Cheat sheet & error messages

## Put it online with GitHub Pages

1. Create a new **public** repository on GitHub (for example `backend-from-zero`).
2. Upload **the contents of this `website` folder** (so `index.html` is at the top level of the repo, next to the `assets` folder).
   On github.com: **Add file → Upload files**, drag everything in, **Commit changes**.
3. In the repository: **Settings → Pages**.
   Under **Build and deployment**, set **Source** to **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After a minute or two the page shows your site's address, like `https://YOUR-NAME.github.io/backend-from-zero/`. Share that link.

Only upload this `website` folder — not the course's `source` folder.

## Notes

- There is no build step: it's plain HTML, CSS and JavaScript.
- The code playgrounds use a small Node/Express/MySQL **simulator** that runs in the browser
  (SQL runs on [sql.js](https://github.com/sql-js/sql.js), set up to act like MySQL).
  Libraries load from cdnjs, so the playgrounds need an internet connection.
- Each visitor's progress, ticked checkboxes and code are saved only in their own browser (localStorage).
- To check every exercise solution, open any page with `?selftest` at the end of the URL.
