default: all

SRC = $(shell find src -name "*.coffee" -type f | sort)
LIB = $(SRC:src/%.coffee=lib/coffee-script/%.js) lib/coffee-script/parser.js
BOOTSTRAPS = $(SRC:src/%.coffee=lib/coffee-script/bootstrap/%.js) lib/coffee-script/bootstrap/parser.js
LIBMIN = $(LIB:lib/coffee-script/%.js=lib/coffee-script/%.min.js)
ROOT = $(shell pwd)

COFFEE = bin/coffee --js --bare
PEGJS = node_modules/.bin/pegjs --cache --export-var 'module.exports'
MOCHA = node_modules/.bin/mocha --compilers coffee:. -u tdd
BROWSERIFY = node_modules/.bin/browserify
MINIFIER = node_modules/.bin/esmangle

all: $(LIB)
build: all
parser: lib/coffee-script/parser.js
browser: build dist/coffee-script-redux.min.js
min: minify
minify: $(LIBMIN)
# TODO: test-browser
# TODO: doc
# TODO: bench


lib:
	mkdir lib/
lib/coffee-script: lib
	mkdir -p lib/coffee-script/
lib/coffee-script/bootstrap: lib/coffee-script
	mkdir -p lib/coffee-script/bootstrap


lib/coffee-script/parser.js: src/grammar.pegjs bootstraps lib/coffee-script
	$(PEGJS) <"$<" >"$(@:%=%.tmp)" && mv "$(@:%=%.tmp)" "$@"
lib/coffee-script/bootstrap/parser.js: src/grammar.pegjs lib/coffee-script/bootstrap
	$(PEGJS) <"$<" >"$@"
lib/coffee-script/bootstrap/%.js: src/%.coffee lib/coffee-script/bootstrap
	$(COFFEE) -i "$<" >"$@"
bootstraps: $(BOOTSTRAPS) lib/coffee-script/bootstrap
	mv lib/coffee-script/bootstrap/* lib/coffee-script
	rmdir lib/coffee-script/bootstrap
lib/coffee-script/%.js: src/%.coffee lib/coffee-script/bootstrap/%.js bootstraps lib/coffee-script
	$(COFFEE) -i "$<" >"$(@:%=%.tmp)" && mv "$(@:%=%.tmp)" "$@"


dist:
	mkdir dist/

dist/coffee-script-redux.js: dist
	$(BROWSERIFY) lib/coffee-script/browser.js > dist/coffee-script-redux.js

dist/coffee-script-redux.min.js: dist/coffee-script-redux.js
	$(MINIFIER) < dist/coffee-script-redux.js > dist/coffee-script-redux.min.js



lib/coffee-script/%.min.js: lib/coffee-script/%.js lib/coffee-script
	$(MINIFIER) <"$<" >"$@"


.PHONY: test coverage install loc clean

test:
	$(MOCHA) -R dot

coverage:
	@which jscoverage || (echo "install node-jscoverage"; exit 1)
	rm -rf instrumented
	jscoverage -v lib instrumented
	$(MOCHA) -R dot
	$(MOCHA) -r instrumented/coffee-script/compiler -R html-cov > coverage.html
	@xdg-open coverage.html &> /dev/null

install:
	npm install -g .

loc:
	wc -l src/*

clean:
	rm -rf instrumented
	rm -f coverage.html
	rm -rf lib
	rm -rf dist
