suite 'Parser', ->

  setup ->
    @shouldParse = (input, done) ->
      doesNotThrow -> parse input, -> do done
    @shouldNotParse = (input, done) ->
      throws -> parse input, ->
      do done


  test 'empty program', (done) -> @shouldParse '', done
  test 'simple number', (done) -> @shouldParse '0', done

  test 'simple number', (done) -> @shouldNotParse '0+', done
