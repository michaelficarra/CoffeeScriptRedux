default: all

SRC = $(wildcard src/*.coffee | sort)
LIB = $(SRC:src/%.coffee=lib/%.js) lib/parser.js
BOOTSTRAPS = $(SRC:src/%.coffee=lib/bootstrap/%.js) lib/bootstrap/parser.js
LIBMIN = $(LIB:lib/%.js=lib/%.min.js)
TEST = $(wildcard test/*.coffee | sort)
ROOT = $(shell pwd)

COFFEE = bin/coffee --js --bare
PEGJS = node_modules/.bin/pegjs --cache --plugin ./lib/pegjs-coffee-plugin
MOCHA = node_modules/.bin/mocha --compilers coffee:./register -u tdd
CJSIFY = node_modules/.bin/cjsify --export CoffeeScript
MINIFIER = node_modules/.bin/esmangle

all: $(LIB)
build: all
parser: lib/parser.js
browser: dist/coffee-script-redux.min.js
min: minify
minify: $(LIBMIN)
# TODO: test-browser
# TODO: doc
# TODO: bench


lib:
	mkdir lib/
lib/bootstrap: lib
	mkdir -p lib/bootstrap


lib/parser.js: src/grammar.pegcoffee bootstraps lib lib/pegjs-coffee-plugin.js
	$(PEGJS) <"$<" >"$@.tmp" && mv "$@.tmp" "$@"
lib/bootstrap/parser.js: src/grammar.pegcoffee lib/bootstrap lib/pegjs-coffee-plugin.js
	$(PEGJS) <"$<" >"$@"
lib/bootstrap/%.js: src/%.coffee lib/bootstrap
	$(COFFEE) -i "$<" >"$@"
bootstraps: $(BOOTSTRAPS) lib/bootstrap
	cp lib/bootstrap/* lib
lib/%.js: src/%.coffee lib/bootstrap/%.js bootstraps lib
	$(COFFEE) -i "$<" >"$@.tmp" && mv "$@.tmp" "$@"


dist:
	mkdir dist/

dist/coffee-script-redux.js: lib/browser.js dist
	$(CJSIFY) src/browser.coffee -vx CoffeeScript \
		-a /src/register.coffee: \
		-a /src/parser.coffee:/lib/parser.js \
		--source-map "$@.map" > "$@"

dist/coffee-script-redux.min.js: lib/browser.js dist
	$(CJSIFY) src/browser.coffee -vmx CoffeeScript \
		-a /src/register.coffee: \
		-a /src/parser.coffee:/lib/parser.js \
		--source-map "$@.map" > "$@"


lib/%.min.js: lib/%.js lib/coffee-script
	$(MINIFIER) <"$<" >"$@"


.PHONY: default all build parser browser min minify test coverage install loc clean

test:
	$(MOCHA) -R dot test/*.coffee

# TODO: use Constellation/ibrik for coverage
coverage:
	@which jscoverage || (echo "install node-jscoverage"; exit 1)
	rm -rf instrumented
	jscoverage -v lib instrumented
	$(MOCHA) -R dot
	$(MOCHA) -r instrumented/compiler -R html-cov > coverage.html
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
