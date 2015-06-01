# Notes for ES6 Mode

The compiler option `--target-es6` enables opportunistic use of ES6
features. This is useful if you are targeting a runtime wiht native
ES6 support, or if you are migrating a codebase from CoffeeScript to
ES6.

Original PR: https://github.com/michaelficarra/CoffeeScriptRedux/pull/344

## What is eligible for ES6 tranpilation?

The following describes the stuff we can convert to ES6. Anything that
is not convertible falls back to the normal CoffeeScript compilation
path.

 - Most classes are eligible for conversion directly into ES6
   classes. If you have a class that is not being converted, run the
   compiler with the environment variable `DEBUG=es6` to see why yours
   is being rejected. ES6 is significantly more strict than
   CoffeeScript about what's legal in a class definition.

     - if you have a constructor, it needs to be a function expression
       directly in the class definition. No "external constructors"
       like:

            class Foo
              constructor: someFunctionDeclaredElsewhere
            
     - we don't deal with compound class names like:

            class X.Foo

        You can get the same effect with assignment, like `X.Foo =
        class ...`.

     - we don't deal with arbitrary expressions for the parent class:

            class X extends someFunctionThatRetunsAClass()

     - in ES6, a derived class's constructor *must* call `super()` and
       it must do it before referencing `this`. We will automatically
       insert a leading `super()` if you weren't manually calling
       super at all, but if you already call `super` and you do it
       after referencing `this`, we will not transpile your class.

     - if you have arbitrary expressions in your class body that do
       not translate directly into methods, static methods, prototype
       properties, or class properties we will ignore your class.

 - Array destructuring is eligible for conversion, with one exception:
   ES6 only allows rest parameters at the end of an array pattern, not
   in the middle. So `[a, b, c...]` gets converted to `[a, b, ...c]`
   but `[a, b..., c]` will not be converted.

 - CoffeeScript bound functions (the fat arrow `=>`) are almost
   completely analogous to ES6 arrow function expressions, except for
   the meaning of the `arguments` keyword. We can safely rewrite every
   practical case, but if you are using both positional arguments and
   referencing the `arguments` keyword we will give up and fall back
   to normal CoffeeScript compilation.
 

## Semantic Differences

There are some differences in semantics that the compiler does not try
to patch over.

 - `super` is required in derived class constructors. If you don't
   already call super, we will insert a `super()` call to make your
   class legal.

 - In CoffeeScript, a parameter's default value is used if the given
   value is `null` or `undefined`. In ES6, a parameter's default value
   is only used if the given value is `undefined`.

 - The methods on an ES6 class are non-enumerable. The methods on a
   CoffeeScript class are enumerable.

