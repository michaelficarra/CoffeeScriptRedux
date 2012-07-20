# TODO: just use prelude.ls?
@any = (list, fn) ->
  for e in list
    return yes if fn e
  no

@all = (list, fn) ->
  for e in list
    return no unless fn e
  yes

@foldl = foldl = (memo, list, fn) ->
  for i in list
    memo = fn memo, i
  memo

@foldl1 = (list, fn) -> foldl list[0], list[1..], fn

@map = map = (list, fn) -> fn e for e in list

@concat = concat = (list) -> [].concat list...

@concatMap = (list, fn) -> concat map list, fn

@intersect = (listA, listB) -> a for a in listA when a in listB

@difference = (listA, listB) -> a for a in listA when a not in listB

@nub = nub = (list) ->
  result = []
  result.push i for i in list when i not in result
  result

@union = (listA, listB) ->
  listA.concat (b for b in (nub listB) when b not in listA)

@flip = (fn) -> (b, a) -> fn.call this, a, b
