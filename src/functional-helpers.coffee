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

@owns = do (hop = {}.hasOwnProperty) -> (a, b) -> hop.call a, b

@span = span = (list, f) ->
  if list.length is 0 then [[], []]
  else if f list[0]
    [ys, zs] = span list[1..], f
    [[list[0], ys...], zs]
  else [[], list]

@divMod = (a, b) ->
  c = a % b
  mod = if c < 0 then c + b else c
  div = Math.floor a / b
  [div, mod]

# The partition function takes a list and predicate fn and returns the pair of lists
# of elements which do and do not satisfy the predicate, respectively.
@partition = (list, fn) ->
  result = [[], []]
  result[+!fn item].push item for item in list
  result
