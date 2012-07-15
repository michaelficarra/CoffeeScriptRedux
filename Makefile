default: all

SRC = $(shell find src -name "*.coffee" -type f | sort)
LIB = $(SRC:src/%.coffee=lib/coffee-script/%.js) lib/coffee-script/parser.js
TESTS = $(shell find test -name "*.coffee" -type f | sort)

COFFEE = node_modules/coffee-script/bin/coffee
PEGJS = node_modules/pegjs/bin/pegjs --track-line-and-column --cache
MOCHA = node_modules/mocha/bin/mocha --compilers coffee:coffee-script -u tdd

all: $(LIB)
build: all

lib/coffee-script/parser.js: src/grammar.pegjs lib/coffee-script
	echo -n "module.exports = " > $@
	$(PEGJS) < $< >> $@

lib/coffee-script/%.js: src/%.coffee lib/coffee-script
	$(COFFEE) -sc < $< > $@

lib/coffee-script:
	mkdir -p lib/coffee-script/

test: $(LIB) $(TESTS)
	$(MOCHA) -R spec

install: $(LIB)
	npm install -g .

coverage: $(LIB)
	@which jscoverage || (echo "install node-jscoverage"; exit 1)
	rm -rf instrumented
	jscoverage -v lib instrumented
	$(MOCHA) -R dot
	$(MOCHA) $(LIB:lib/%.js=-r instrumented/%) -r instrumented/coffee-script/parser -R html-cov > coverage.html
	@xdg-open coverage.html &> /dev/null

clean:
	rm -rf instrumented
	rm coverage.html

.PHONY: test coverage clean install
