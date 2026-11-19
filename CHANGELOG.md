# Changelog

## 0.1.0 (2026-11-19)


### Features

* add admin article table with filters, server-side paging and bulk status changes ([#199](https://github.com/shoraLBRT/mktba/issues/199)) ([3657102](https://github.com/shoraLBRT/mktba/commit/365710233c82db6ed356126584a7339b0271ec7a))
* add article dates, author and co-authors ([#186](https://github.com/shoraLBRT/mktba/issues/186)) ([0c05c25](https://github.com/shoraLBRT/mktba/commit/0c05c250841095a011609fcf2da378843a055a30))
* add article locale, translation groups and localizable school names ([#190](https://github.com/shoraLBRT/mktba/issues/190)) ([4f77c9e](https://github.com/shoraLBRT/mktba/commit/4f77c9e943c7792fc00f5781a7a95442c45b68b8))
* add article order in the tree with move and cycle protection ([#189](https://github.com/shoraLBRT/mktba/issues/189)) ([0461ed8](https://github.com/shoraLBRT/mktba/commit/0461ed8bb0de1f26bc862960ec5d178377159b3d))
* add article revisions with history, compare and rollback ([#187](https://github.com/shoraLBRT/mktba/issues/187)) ([4d5443d](https://github.com/shoraLBRT/mktba/commit/4d5443de35be7ed87e250e4cd76ac0acdadb7ee7))
* add article SEO fields with editor section and client-side meta tags ([#191](https://github.com/shoraLBRT/mktba/issues/191)) ([36a106b](https://github.com/shoraLBRT/mktba/commit/36a106bb4a412709318e765a6cb9b2d77e251153))
* add article slugs with redirects from old slugs ([#184](https://github.com/shoraLBRT/mktba/issues/184)) ([a13a2a5](https://github.com/shoraLBRT/mktba/commit/a13a2a5275f5a39f13ccf30ebc6a6ef3aaf6c2d1))
* add article status with review workflow and publish-only public reads ([#185](https://github.com/shoraLBRT/mktba/issues/185)) ([e6992bd](https://github.com/shoraLBRT/mktba/commit/e6992bdff3adcb7116113734e6a88e23a44bf6d1))
* add favicon, app icons, web manifest and theme colour ([#210](https://github.com/shoraLBRT/mktba/issues/210)) ([15b1d25](https://github.com/shoraLBRT/mktba/commit/15b1d255c16d9e7cb2cb11c25a9a38710a742780))
* add JSON-LD structured data to public pages ([#205](https://github.com/shoraLBRT/mktba/issues/205)) ([aaad961](https://github.com/shoraLBRT/mktba/commit/aaad9615f493f63b0283714cc6aa656ce6f22bfa))
* add Reader, Author, Scholar and Admin roles with named authorization policies ([#192](https://github.com/shoraLBRT/mktba/issues/192)) ([c5bd4b8](https://github.com/shoraLBRT/mktba/commit/c5bd4b8eb18fb81c4ce3ea5a5279242c3827bf66))
* add rotating refresh-token sessions with httpOnly cookie and logout on all devices ([#195](https://github.com/shoraLBRT/mktba/issues/195)) ([2a790e2](https://github.com/shoraLBRT/mktba/commit/2a790e2df50bca174e5b537625fec8a0eaf201cc))
* add single-use role invites with expiry, revocation and admin role management ([#196](https://github.com/shoraLBRT/mktba/issues/196)) ([7f4fa82](https://github.com/shoraLBRT/mktba/commit/7f4fa82309cf9d2df16b478619a02fcb4ec95f7d))
* add sitemap.xml and robots.txt with lastmod, splitting and hreflang alternates ([#206](https://github.com/shoraLBRT/mktba/issues/206)) ([25fb0df](https://github.com/shoraLBRT/mktba/commit/25fb0dfb4765964b7bbb18d2f09162892cd3f241))
* add title, description, canonical, Open Graph and Twitter Card to every page ([#204](https://github.com/shoraLBRT/mktba/issues/204)) ([7d98565](https://github.com/shoraLBRT/mktba/commit/7d9856528897439f0a71c52d3b2ede14def49eb9)), closes [#55](https://github.com/shoraLBRT/mktba/issues/55)
* answer 410 for removed articles and noindex stubs and drafts ([#207](https://github.com/shoraLBRT/mktba/issues/207)) ([b9e2950](https://github.com/shoraLBRT/mktba/commit/b9e29509c19e30dd385d092c7718990685943c66))
* give the admin its own layout with a role-filtered section menu ([#197](https://github.com/shoraLBRT/mktba/issues/197)) ([98913b8](https://github.com/shoraLBRT/mktba/commit/98913b83ac6698fc55ba28bb924d49316ed45044))
* let authors edit and submit only their own articles with per-article authorization ([#193](https://github.com/shoraLBRT/mktba/issues/193)) ([f7240d3](https://github.com/shoraLBRT/mktba/commit/f7240d3590eba71884d0be498e8fbe100d46181e))
* name opinion tabs after schools and note a missing mazhab opinion ([#212](https://github.com/shoraLBRT/mktba/issues/212)) ([7890241](https://github.com/shoraLBRT/mktba/commit/78902414221d9786cca395b63a51f8ff1d302e16))
* render every opinion of a block in the page HTML ([#203](https://github.com/shoraLBRT/mktba/issues/203)) ([799dd04](https://github.com/shoraLBRT/mktba/commit/799dd04e0ccfe87d7a426f258ca1f56fe688832a))
* render public pages on the server with React Router framework mode ([#202](https://github.com/shoraLBRT/mktba/issues/202)) ([94dec98](https://github.com/shoraLBRT/mktba/commit/94dec9858ab50cee0308afde41ec677f27fe79eb))


### Bug Fixes

* **api:** rate-limit auth and AI endpoints ([#176](https://github.com/shoraLBRT/mktba/issues/176)) ([73f4779](https://github.com/shoraLBRT/mktba/commit/73f4779c54bd3d6661787e0a7e3e65351ce0c24c))
* **api:** refuse to start outside Development with a weak JWT signing key ([#175](https://github.com/shoraLBRT/mktba/issues/175)) ([0999590](https://github.com/shoraLBRT/mktba/commit/0999590cfc0fb176df577f693922622576ebac9e))
* **api:** reject school ids on a single-opinion paragraph ([#180](https://github.com/shoraLBRT/mktba/issues/180)) ([593582b](https://github.com/shoraLBRT/mktba/commit/593582b01d67c568bb31c3e6a15db3ed53f5c286))
* **api:** require auth for paragraph read endpoints ([#173](https://github.com/shoraLBRT/mktba/issues/173)) ([52246d0](https://github.com/shoraLBRT/mktba/commit/52246d058cfa93c054aad6f4d6821d9bc06b2760))
* **api:** return error codes in problem bodies and translate them in the UI ([#179](https://github.com/shoraLBRT/mktba/issues/179)) ([9b7506c](https://github.com/shoraLBRT/mktba/commit/9b7506cc68e345356c1b088bda17462900a99da0))
* **config:** load appsettings.local.json and document the local run ([#182](https://github.com/shoraLBRT/mktba/issues/182)) ([fa01308](https://github.com/shoraLBRT/mktba/commit/fa013088eab8a2f74c58af3950e673265ef95b6c))
* give public pages one h1, landmarks, nested headings and time elements ([#209](https://github.com/shoraLBRT/mktba/issues/209)) ([8673ae3](https://github.com/shoraLBRT/mktba/commit/8673ae395e3e914d23de908a47879d917ca8b447))
* hide the Blog and Q&A service tabs from the header ([#201](https://github.com/shoraLBRT/mktba/issues/201)) ([d294328](https://github.com/shoraLBRT/mktba/commit/d2943285540d193134997107db3168424746a01a)), closes [#48](https://github.com/shoraLBRT/mktba/issues/48)
* localize remaining admin strings and forbid hard-coded UI text by lint ([#200](https://github.com/shoraLBRT/mktba/issues/200)) ([0739341](https://github.com/shoraLBRT/mktba/commit/073934131bec3f80a652db7fe87ebb6fddfadd29))
* remove the default AI provider and require explicit configuration ([#183](https://github.com/shoraLBRT/mktba/issues/183)) ([b9a7d36](https://github.com/shoraLBRT/mktba/commit/b9a7d36ac70a44f136c101868d7247ee482d951a))
* **web:** add an error boundary and a 404 page, move article creation under /admin ([#178](https://github.com/shoraLBRT/mktba/issues/178)) ([6328c66](https://github.com/shoraLBRT/mktba/commit/6328c66cd4c155a634a9b662c3b18cef513c7862))


### Performance Improvements

* self-host fonts, trim the markdown bundle and add a JS size budget ([#208](https://github.com/shoraLBRT/mktba/issues/208)) ([daf2b4f](https://github.com/shoraLBRT/mktba/commit/daf2b4ff6ec0bd5a28f6eeffbe2d454b4b5d1a77))
* **web:** cache React Query data and share the navigation tree query ([#177](https://github.com/shoraLBRT/mktba/issues/177)) ([259d41f](https://github.com/shoraLBRT/mktba/commit/259d41fc2c7cd7332f1068dca2ced8f0174c11ee)), closes [#13](https://github.com/shoraLBRT/mktba/issues/13)
