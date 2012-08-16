default: all

SRC = $(shell find src -name "*.coffee" -type f | sort)
LIB = $(SRC:src/%.coffee=lib/coffee-script/%.js) lib/coffee-script/parser.js
LIBMIN = $(LIB:lib/coffee-script/%.js=lib/coffee-script/%.min.js)
TESTS = $(shell find test -name "*.coffee" -type f | sort)
ROOT = $(shell pwd)

# TODO: use `node_modules/.bin/<binary>`
COFFEE = node_modules/coffee-script/bin/coffee
PEGJS = node_modules/pegjs/bin/pegjs --track-line-and-column --cache
MOCHA = node_modules/mocha/bin/mocha --compilers coffee:. -u tdd
MINIFIER = node_modules/uglify-js/bin/uglifyjs --no-copyright --mangle-toplevel --reserved-names require,module,exports,global,window

all: $(LIB)
build: all
parser: lib/coffee-script/parser.js
minify: $(LIBMIN)
deps:
	git submodule update --init
	cd $(ROOT)/node_modules/mocha && npm install commander debug diff
	cd $(ROOT)/node_modules/pegjs && make build
	cd $(ROOT)
# TODO: build-browser
# TODO: test-browser
# TODO: doc
# TODO: bench

lib/coffee-script:
	mkdir -p lib/coffee-script/

lib/coffee-script/parser.js: src/grammar.pegjs lib/coffee-script
	printf %s "module.exports = " > "$@"
	$(PEGJS) < "$<" >> "$@"

lib/coffee-script/%.js: src/%.coffee lib/coffee-script
	$(COFFEE) -bsc < "$<" > "$@"

lib/coffee-script/%.min.js: lib/coffee-script/%.js lib/coffee-script
	$(MINIFIER) < "$<" > "$@"


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
	rm -rf lib/*
