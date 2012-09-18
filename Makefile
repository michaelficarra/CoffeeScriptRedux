default: all

SRC = $(shell find src -name "*.coffee" -type f | sort)
LIB = $(SRC:src/%.coffee=lib/coffee-script/%.js) lib/coffee-script/parser.js
BOOTSTRAPS = $(SRC:src/%.coffee=lib/coffee-script/bootstrap/%.js) lib/coffee-script/parser.js
LIBMIN = $(LIB:lib/coffee-script/%.js=lib/coffee-script/%.min.js)
TESTS = $(shell find test -name "*.coffee" -type f | sort)
ROOT = $(shell pwd)

COFFEE = bin/coffee --js
PEGJS = node_modules/.bin/pegjs --track-line-and-column --cache
MOCHA = node_modules/.bin/mocha --compilers coffee:. -u tdd
MINIFIER = node_modules/.bin/uglifyjs --no-copyright --mangle-toplevel --reserved-names require,module,exports,global,window

all: $(LIB)
build: all
parser: lib/coffee-script/parser.js
minify: $(LIBMIN)
deps:
	git submodule update --init
	cd $(ROOT)/node_modules/mocha && npm install
	cd $(ROOT)/node_modules/pegjs && make build
	cd $(ROOT)
# TODO: build-browser
# TODO: test-browser
# TODO: doc
# TODO: bench

lib:
	mkdir lib/

lib/coffee-script: lib
	mkdir -p lib/coffee-script/

lib/coffee-script/bootstrap: lib/coffee-script
	mkdir -p lib/coffee-script/bootstrap

lib/coffee-script/parser.js: src/grammar.pegjs lib/coffee-script
	printf %s "module.exports = " >"$@"
	$(PEGJS) <"$<" >>"$@"

lib/coffee-script/%.min.js: lib/coffee-script/%.js lib/coffee-script
	$(MINIFIER) <"$<" >"$@"

lib/coffee-script/bootstrap/%.js: src/%.coffee lib/coffee-script/bootstrap
	$(COFFEE) <"$<" >"$@"

bootstraps: $(BOOTSTRAPS) lib/coffee-script/bootstrap
	cp lib/coffee-script/bootstrap/* lib/coffee-script


lib/coffee-script/%.js: src/%.coffee lib/coffee-script/bootstrap/%.js bootstraps lib/coffee-script
	$(COFFEE) <"$<" >"$(@:%=%.tmp)" && mv "$(@:%=%.tmp)" "$@"


.PHONY: test coverage install loc clean

test: $(LIB) $(TESTS)
	$(MOCHA) -R dot

coverage: $(LIB)
	@which jscoverage || (echo "install node-jscoverage"; exit 1)
	rm -rf instrumented
	jscoverage -v lib instrumented
	$(MOCHA) -R dot
	$(MOCHA) -r instrumented/coffee-script/compiler -R html-cov > coverage.html
	@xdg-open coverage.html &> /dev/null

install: $(LIB)
	npm install -g .

loc:
	wc -l src/*

clean:
	rm -rf instrumented
	rm -f coverage.html
	rm -rf lib
