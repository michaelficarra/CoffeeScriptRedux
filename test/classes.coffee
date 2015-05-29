suite 'Classes', ->

  suite 'Class Definition', ->

    test "Overriding the static property new doesn't clobber Function::new", ->

      class OneClass
        @new: 'new'
        function: 'function'
        constructor: (name) -> @name = name

      class TwoClass extends OneClass
      delete TwoClass.new

      Function.prototype.new = -> new this arguments...

      ok (TwoClass.new('three')).name is 'three'
      ok (new OneClass).function is 'function'
      ok OneClass.new is 'new'

      delete Function.prototype.new

    test 'basic classes, again, but in the manual prototype style', ->

      Base = ->
      Base::func = (string) ->
        'zero/' + string
      Base::['func-func'] = (string) ->
        "dynamic-#{string}"

      FirstChild = ->
      SecondChild = ->
      ThirdChild = ->
        @array = [1, 2, 3]
        this

      ThirdChild extends SecondChild extends FirstChild extends Base

      FirstChild::func = (string) ->
        super('one/') + string

      SecondChild::func = (string) ->
        super('two/') + string

      ThirdChild::func = (string) ->
        super('three/') + string

      result = (new ThirdChild).func 'four'

      ok result is 'zero/one/two/three/four'

      ok (new ThirdChild)['func-func']('thing') is 'dynamic-thing'

    test 'static assignment via colon', ->
      nonce = {}
      class A then @b: nonce
      eq nonce, A.b

    test 'classes with JS-keyword properties', ->

      class Class
        class: 'class'
        name: -> @class

      instance = new Class
      ok instance.class is 'class'
      ok instance.name() is 'class'

    test 'nothing classes', ->

      c = class
      ok c instanceof Function

    test 'instance-bound methods and statically-bound methods', ->

      class Dog
        constructor: (name) ->
          @name = name

        bark: =>
          "#{@name} woofs!"

        @static = =>
          new this('Dog')

      spark = new Dog('Spark')
      fido  = new Dog('Fido')
      fido.bark = spark.bark

      ok fido.bark() is 'Spark woofs!'

      obj = {func: Dog.static}

      ok obj.func().name is 'Dog'

    test 'anonymous classes', ->

      obj = klass: class
        method: -> 'value'

      instance = new obj.klass
      ok instance.method() is 'value'

    test 'Implicit objects as static properties', ->

      class Static
        @static =
          one: 1
          two: 2

      ok Static.static.one is 1
      ok Static.static.two is 2

    test.skip 'classes with static-level implicit objects', ->

      class A
        @static = one: 1
        two: 2

      class B
        @static = one: 1,
        two: 2

      eq A.static.one, 1
      eq A.static.two, undefined
      eq (new A).two, 2

      eq B.static.one, 1
      eq B.static.two, 2
      eq (new B).two, undefined

    test 'external constructors', ->

      counter = 0
      classMaker = ->
        inner = ++counter
        ->
          @value = inner

      class One
        constructor: classMaker()

      class Two
        constructor: classMaker()

      eq (new One).value, 1
      eq (new Two).value, 2
      eq (new One).value, 1
      eq (new Two).value, 2

    test.skip 'exectuable class bodies', ->

      class A
        if true
          b: 'b'
        else
          c: 'c'

      a = new A

      eq a.b, 'b'
      eq a.c, undefined

    test 'mild metaprogramming', ->

      class Base
        @attr = (name) ->
          this::[name] = (val) ->
            if arguments.length > 0
              this["_#{name}"] = val
            else
              this["_#{name}"]

      class Robot extends Base
        @attr 'power'
        @attr 'speed'

      robby = new Robot

      ok robby.power() is undefined

      robby.power 11
      robby.speed Infinity

      eq robby.power(), 11
      eq robby.speed(), Infinity

    test 'namespaced classes do not reserve their function name in outside scope', ->

      one = {}
      two = {}

      class one.Klass
        @label = "one"

      class two.Klass
        @label = "two"

      eq typeof Klass, 'undefined'
      eq one.Klass.label, 'one'
      eq two.Klass.label, 'two'

    test 'nested classes', ->

      class Outer
        constructor: ->
          @label = 'outer'

        class @Inner
          constructor: ->
            @label = 'inner'

      eq (new Outer).label, 'outer'
      eq (new Outer.Inner).label, 'inner'

    test 'variables in constructor bodies are correctly scoped', ->

      class A
        x = 1
        constructor: ->
          x = 10
          y = 20
        y = 2
        captured: ->
          {x, y}

      a = new A
      eq a.captured().x, 10
      eq a.captured().y, 2

    test 'Issue #924: Static methods in nested classes', ->

      class A
        @B = class
          @c = -> 5

      eq A.B.c(), 5

    test 'jashkenas/coffee-script#1182: a subclass should be able to set its constructor to an external function', ->
      ctor = ->
        @val = 1
      class A
      class B extends A
        constructor: ctor
      eq (new B).val, 1

    test 'jashkenas/coffee-script#1182: external constructors continued', ->
      ctor = ->
      class A
      class B extends A
        method: ->
        constructor: ctor
      ok B::method

    test 'jashkenas/coffee-script#1182: execution order needs to be considered as well', ->
      counter = 0
      makeFn = (n) -> eq n, ++counter; ->
      class B extends (makeFn 1)
        @B = makeFn 2
        constructor: makeFn 3

    test 'jashkenas/coffee-script#1182: external constructors with bound functions', ->
      fn = ->
        {one: 1}
        this
      class B
      class A
        constructor: fn
        method: => this instanceof A
      ok (new A).method.call(new B)

    test 'jashkenas/coffee-script#1372: bound class methods with reserved names', ->
      class C
        delete: =>
      ok C::delete

    test 'jashkenas/coffee-script#1464: bound class methods should keep context', ->
      nonce  = {}
      class C
        constructor: (id) -> @id = id
        @boundStatic = => new this(nonce)
      eq nonce, C.boundStatic().id

    test 'jashkenas/coffee-script#1009: classes with reserved words as determined names', ->
      fn = ->
        eq 'function', typeof (class @for)
        ok not /\seval\s?\(/.test (class @eval).toString()
        ok not /\sarguments\s\(/.test (class @arguments).toString()
      fn.call {}

    test 'jashkenas/coffee-script#1842: Regression with bound functions within bound class methods', ->

      class Store
        @bound = =>
          do =>
            eq this, Store

      Store.bound()

      # And a fancier case:

      class Store

        eq this, Store

        @bound = =>
          do =>
            eq this, Store

        @unbound = ->
          eq this, Store

        instance: =>
          ok this instanceof Store

      Store.bound()
      Store.unbound()
      (new Store).instance()

    test 'jashkenas/coffee-script#1813: Passing class definitions as expressions', ->
      ident = (x) -> x

      result = ident class A then x = 1

      eq result, A

      result = ident class B extends A
        x = 1

      eq result, B

    test 'jashkenas/coffee-script#1966: external constructors should produce their return value', ->
      ctor = -> {}
      class A then constructor: ctor
      ok (new A) not instanceof A

    test.skip "jashkenas/coffee-script#1534: class then 'use strict'", ->
      # [14.1 Directive Prologues and the Use Strict Directive](http://es5.github.com/#x14.1)
      nonce = {}
      error = 'do -> ok this'
      strictTest = "do ->'use strict';#{error}"
      return unless (try CoffeeScript.run strictTest, bare: yes catch e then nonce) is nonce

      throws -> CoffeeScript.run "class then 'use strict';#{error}", bare: yes
      doesNotThrow -> CoffeeScript.run "class then #{error}", bare: yes
      doesNotThrow -> CoffeeScript.run "class then #{error};'use strict'", bare: yes

      # comments are ignored in the Directive Prologue
      comments = ["""
      class
        ### comment ###
        'use strict'
        #{error}""",
      """
      class
        ### comment 1 ###
        ### comment 2 ###
        'use strict'
        #{error}""",
      """
      class
        ### comment 1 ###
        ### comment 2 ###
        'use strict'
        #{error}
        ### comment 3 ###"""
      ]
      throws (-> CoffeeScript.run comment, bare: yes) for comment in comments

      # [ES5 §14.1](http://es5.github.com/#x14.1) allows for other directives
      directives = ["""
      class
        'directive 1'
        'use strict'
        #{error}""",
      """
      class
        'use strict'
        'directive 2'
        #{error}""",
      """
      class
        ### comment 1 ###
        'directive 1'
        'use strict'
        #{error}""",
      """
      class
        ### comment 1 ###
        'directive 1'
        ### comment 2 ###
        'use strict'
        #{error}"""
      ]
      throws (-> CoffeeScript.run directive, bare: yes) for directive in directives

    test 'jashkenas/coffee-script#2052: classes should work in strict mode', ->
      do ->
        'use strict'
        class A


  suite 'Class Instantiation', ->

    test '"@" referring to the current instance, and not being coerced into a call', ->

      class ClassName
        amI: ->
          this instanceof ClassName

      obj = new ClassName
      ok obj.amI()

    test 'a bound function in a bound function', ->

      class Mini
        num: 10
        generate: =>
          for i in [0, 0, 0]
            => @num

      m = new Mini
      eq (func() for func in m.generate()).join(' '), '10 10 10'

    test 'contructor called with varargs', ->

      class Connection
        constructor: (one, two, three) ->
          [@one, @two, @three] = [one, two, three]

        out: ->
          "#{@one}-#{@two}-#{@three}"

      list = [3, 2, 1]
      conn = new Connection list...
      ok conn instanceof Connection
      ok conn.out() is '3-2-1'

    test 'classes wrapped in decorators', ->

      func = (klass) ->
        klass::prop = 'value'
        klass

      func class Test
        prop2: 'value2'

      ok (new Test).prop  is 'value'
      ok (new Test).prop2 is 'value2'

    test 'ensure that constructors invoked with splats return a new object', ->

      args = [1, 2, 3]
      Type = (@args) ->
      type = new Type args

      ok type and type instanceof Type
      ok type.args and type.args instanceof Array
      ok v is args[i] for v, i in type.args

      Type1 = (@a, @b, @c) ->
      type1 = new Type1 args...

      ok type1 instanceof   Type1
      eq type1.constructor, Type1
      ok type1.a is args[0] and type1.b is args[1] and type1.c is args[2]

      # Ensure that constructors invoked with splats cache the function.
      called = 0
      get = -> if called++ then false else class Type
      new get() args...

    test '`new` shouldn\'t add extra parens', ->

      ok new Date().constructor is Date

    # TODO: this test belongs with the operator tests
    test '`new` works against bare function', ->

      eq Date, new ->
        eq this, new => this
        Date


  suite 'Inheritance and Super', ->

    test 'classes with a four-level inheritance chain', ->
      class Base
        func: (string) ->
          "zero/#{string}"

        @static: (string) ->
          "static/#{string}"

      class FirstChild extends Base
        func: (string) ->
          super('one/') + string

      SecondChild = class extends FirstChild
        func: (string) ->
          super('two/') + string

      thirdCtor = ->
        @array = [1, 2, 3]

      class ThirdChild extends SecondChild
        constructor: -> thirdCtor.call this

        # Gratuitous comment for testing.
        func: (string) ->
          super('three/') + string

      result = (new ThirdChild).func 'four'

      ok result is 'zero/one/two/three/four'
      ok Base.static('word') is 'static/word'

      FirstChild::func = (string) ->
        super('one/').length + string

      result = (new ThirdChild).func 'four'
      # eq result, '9two/three/four' # can't pass super('one/').length + string
      # ok (new ThirdChild).array.join(' ') is '1 2 3'

    test 'constructors with inheritance and super', ->
      identity = (f) -> f

      class TopClass
        constructor: (arg) ->
          @prop = 'top-' + arg

      class SuperClass extends TopClass
        constructor: (arg) ->
          identity super 'super-' + arg

      class SubClass extends SuperClass
        constructor: ->
          identity super 'sub'

      ok (new SubClass).prop is 'top-super-sub'

    test "super with plain ol' functions as the original constructors", ->
      TopClass = ->
      TopClass::func = (arg) ->
        'top-' + arg

      SuperClass = ->
      SuperClass extends TopClass
      SuperClass::func = (arg) ->
        super 'super-' + arg

      SubClass = ->
      SubClass extends SuperClass
      SubClass::func = ->
        super 'sub'

      eq (new SubClass).func(), 'top-super-sub'

    test 'super() calls in constructors of classes that are defined as object properties', ->
      class Hive
        constructor: (name) -> @name = name

      class Hive.Bee extends Hive
        constructor: (name) -> super

      maya = new Hive.Bee 'Maya'
      ok maya.name is 'Maya'

    test 'calling super and passing along all arguments', ->
      class Parent
        method: (args...) -> @args = args

      class Child extends Parent
        method: -> super

      c = new Child
      c.method 1, 2, 3, 4
      ok c.args.join(' ') is '1 2 3 4'

    test.skip '`class extends this`', -> # Currently syntax error.
    #
    #  class A
    #    func: -> 'A'
    #
    #  B = null
    #  makeClass = ->
    #    B = class extends this
    #      func: -> super + ' B'
    #
    #  makeClass.call A
    #
    #  eq (new B()).func(), 'A B'

    test 'jashkenas/coffee-script#1313: misplaced __extends', ->
      nonce = {}
      class A
      class B extends A
        prop: nonce
        constructor: ->
      eq nonce, B::prop

    test.skip 'jashkenas/coffee-script#1380: `super` with reserved names', -> # Currently syntax error.
    #  class C
    #    do: -> super
    #  ok C::do
    #
    #  class B
    #    0: -> super
    #  ok B::[0]

    test 'jashkenas/coffee-script#1482: classes can extend expressions', ->
      id = (x) -> x
      nonce = {}
      class A then nonce: nonce
      class B extends id A
      eq nonce, (new B).nonce

    test 'jashkenas/coffee-script#1598: super works for static methods too', ->

      class Parent
        method: ->
          'NO'
        @method: ->
          'yes'

      class Child extends Parent
        @method: ->
          'pass? ' + super

      eq Child.method(), 'pass? yes'

    test 'jashkenas/coffee-script#1876: Class @A extends A', ->
      class A
      class @A extends A

      ok (new @A) instanceof A

    test 'jashkenas/coffee-script#1980: regression with an inherited class with static function members', ->

      class A

      class B extends A
        @static = => 'value'

      eq B.static(), 'value'

    test 'bound function literals as constructors should be treated as unbound', ->
      nonce = {}
      class A
        constructor: =>
          @nonce = nonce
      a = new A
      ok a instanceof A
      eq nonce, a.nonce

    test '#199: implicit object as static class member', ->
      nonceA = {}
      nonceB = {}
      class A
        @prop:
          a: nonceA
          b: nonceB
      eq nonceA, A.prop.a
      eq nonceB, A.prop.b

    test '#205: implicit objects should not consume following prototype assignments', ->
      class A
        a: b: 0
        c: 1
      ok 'a' of A.prototype
      ok 'b' of A::a
      ok 'b' not of A.prototype
      ok 'c' of A.prototype

    test '#201: subclasses without explicit constructors inherit parent constructors', ->
      i = 0
      class A
        constructor: -> i++
      class B extends A

      eq 0, i
      a = new A
      ok a instanceof A
      eq 1, i
      b = new B
      eq 2, i
      ok b instanceof B
      ok b instanceof A
