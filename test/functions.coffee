suite 'Function Literals', ->

  suite 'Function Definition', ->

    test 'basic functions', ->

      fn = -> 3
      eq 'function', typeof fn
      ok fn instanceof Function
      eq 3, fn()

    test 'empty functions', ->
      fn = ->
      eq 'function', typeof fn
      eq undefined, fn()
      fn = () ->
      eq 'function', typeof fn
      eq undefined, fn()

    test 'multiple nested single-line functions', ->
      func = (x) -> (x) -> (x) -> x
      eq 3, func(1)(2)(3)

    test 'multiple nested single-line functions mixed with implicit calls', ->
      fn = (one) -> (two) -> three four, (five) -> six seven, eight, (nine) ->
      eq 'function', typeof fn

    test "self-referencing functions", ->
      changeMe = ->
        changeMe = 2
      eq 'function', typeof changeMe
      eq 2, changeMe()
      eq 2, changeMe

    test "#1859: inline function bodies shouldn't modify prior postfix ifs", ->
      list = [1, 2, 3]
      ok true if list.some (x) -> x is 2


  suite 'Bound Function Definition', ->

    #test 'basic bound functions', ->
    #  obj = {
    #    bound: ->
    #      (=> this)()
    #    unbound: ->
    #      (-> this)()
    #    nested: ->
    #      (=>
    #        (=>
    #          (=> this)()
    #        )()
    #      )()
    #  }
    #  eq obj, obj.bound()
    #  ok obj isnt obj.unbound()
    #  eq obj, obj.nested()

    #test "fancy bound functions", ->
    #  obj = {
    #    one: ->
    #      do =>
    #        return this.two()
    #    two: ->
    #      do =>
    #        do =>
    #          do =>
    #            return this.three
    #    three: 3
    #  }
    #  eq obj.one(), 3

    test "#1844: bound functions in nested comprehensions causing empty var statements", ->
      a = ((=>) for a in [0] for b in [0])
      eq 1, a.length


  suite 'Parameter List Features', ->

    #test "splats", ->
    #  arrayEq [0, 1, 2], (((splat...) -> splat) 0, 1, 2)
    #  arrayEq [2, 3], (((_, _1, splat...) -> splat) 0, 1, 2, 3)
    #  arrayEq [0, 1], (((splat..., _, _1) -> splat) 0, 1, 2, 3)
    #  arrayEq [2], (((_, _1, splat..., _2) -> splat) 0, 1, 2, 3)

    #test "destructured splatted parameters", ->
    #  arr = [0,1,2]
    #  splatArray = ([a...]) -> a
    #  splatArrayRest = ([a...],b...) -> arrayEq(a,b); b
    #  arrayEq splatArray(arr), arr
    #  arrayEq splatArrayRest(arr,0,1,2), arr

    test "@-parameters: automatically assign an argument's value to a property of the context", ->
      nonce = {}

      ((@prop) ->).call context = {}, nonce
      eq nonce, context.prop

      #((splat..., @prop) ->).apply context = {}, [0, 0, nonce]
      #eq nonce, context.prop

      #((@prop...) ->).call context = {}, 0, nonce, 0
      #eq nonce, context.prop[1]

      eq 0, ((@prop) -> @prop).call {}, 0
      eq 'undefined', ((@prop) -> typeof prop).call {}, 0

    #test "@-parameters and splats with constructors", ->
    #  a = {}
    #  b = {}
    #  class Klass
    #    constructor: (@first, splat..., @last) ->
    #
    #  obj = new Klass a, 0, 0, b
    #  eq a, obj.first
    #  eq b, obj.last

    #test "destructuring splats", ->
    #  (([{a: [b], c}]...) ->
    #    eq 1, b
    #    eq 2, c
    #  ) {a: [1], c: 2}

    test "default values", ->
      nonceA = {}
      nonceB = {}
      a = (_,_1,arg=nonceA) -> arg
      eq nonceA, a()
      eq nonceA, a(0)
      eq nonceB, a(0,0,nonceB)
      eq nonceA, a(0,0,undefined)
      eq nonceA, a(0,0,null)
      eq false , a(0,0,false)
      eq nonceB, a(undefined,undefined,nonceB,undefined)
      b = (_,arg=nonceA,_1,_2) -> arg
      eq nonceA, b()
      eq nonceA, b(0)
      eq nonceB, b(0,nonceB)
      eq nonceA, b(0,undefined)
      eq nonceA, b(0,null)
      eq false , b(0,false)
      eq nonceB, b(undefined,nonceB,undefined)
      c = (arg=nonceA,_,_1) -> arg
      eq nonceA, c()
      eq      0, c(0)
      eq nonceB, c(nonceB)
      eq nonceA, c(undefined)
      eq nonceA, c(null)
      eq false , c(false)
      eq nonceB, c(nonceB,undefined,undefined)

    test "default values with @-parameters", ->
      nonceA = {}
      nonceB = {}
      obj = {f: (q = nonceA, @p = nonceB) -> q}
      eq nonceA, obj.f()
      eq nonceB, obj.p
      eq nonceB, obj.f nonceB, nonceA
      eq nonceA, obj.p

    #test "default values with splatted arguments", ->
    #  withSplats = (a = 2, b..., c = 3, d = 5) -> a * (b.length + 1) * c * d
    #  eq 30, withSplats()
    #  eq 15, withSplats(1)
    #  eq  5, withSplats(1,1)
    #  eq  1, withSplats(1,1,1)
    #  eq  2, withSplats(1,1,1,1)

    test "default values with function calls", ->
      counter = 0
      fn = -> ++counter
      eq 1, ((x = fn()) -> x)()
      eq fn, ((x = fn()) -> x) fn
      eq 0, ((x = fn) -> x()) -> 0
      eq 2, ((x = fn()) -> x)()

    test "arguments vs parameters", ->
      nonce = {}
      f = (x) -> x()
      eq nonce, f (x) -> nonce
      g = -> f
      eq nonce, g(f) -> nonce

    test "#2258: allow whitespace-style parameter lists in function definitions", ->
      func = (
        a, b, c
      ) -> c
      eq func(1, 2, 3), 3
      func = (
        a
        b
        c
      ) -> b
      eq func(1, 2, 3), 2
      func = (
        a,
        b,
        c
      ) -> b
      eq func(1, 2, 3), 2

    test '#66: functions whose final expression is `throw` should compile', ->
      (->) -> throw {}
      (->) ->
        a = Math.random()
        if a then throw {}
