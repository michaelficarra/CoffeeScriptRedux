suite 'Edgar Allan Poe', ->

  test 'The Raven', ->
    CoffeeScript.parse '''
      Once upon a mignight dreary while I pondered, weak and weary,
      Over many quaint and curious volume of forgotten lore -
      While I nodded, nearly napping, suddenly there came a tapping,
      As of some one gently rapping, rapping at my chamber door
      "'Tis some visiter". I muttered, "tapping at my chamber door" -
      "only this and nothing more."

      Ah distinctly I remember it was in the bleak December;
      And each separate dying ember wrought its ghost upon the floor.
      Eagerly I wished the morrow - vainly I had sought to borrow,
      From my books surcease of sorrow - sorrow For the lost Lenore -
      For the rare and radiant maiden whom the angels name Lenore -
      Nameless here For evermore
    '''
