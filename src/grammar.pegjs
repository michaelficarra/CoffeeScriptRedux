{
  var Nodes = require("./lib/coffee-script/nodes"),
      inspect = function(o){ console.log(require('util').inspect(o, false, 9e9, true)); },
      constructorLookup =
        { ';': Nodes.SeqOp
        , '=': Nodes.AssignOp
        , '&&': Nodes.AndOp
        , and: Nodes.AndOp
        , '||': Nodes.OrOp
        , or: Nodes.OrOp
        , '|': Nodes.BitOrOp
        , '^': Nodes.BitXorOp
        , '&': Nodes.BitAndOp
        , '?': Nodes.ExistsOp
        , '==': Nodes.EQOp
        , is: Nodes.EQOp
        , '!=': Nodes.NEQOp
        , isnt: Nodes.NEQOp
        , '<=': Nodes.LTEOp
        , '>=': Nodes.GTEOp
        , '<': Nodes.LTOp
        , '>': Nodes.GTOp
        , instancef: Nodes.InstanceofOp
        , in: Nodes.InOp
        , of: Nodes.OfOp
        , '<<': Nodes.LeftShiftOp
        , '>>': Nodes.SignedRightShiftOp
        , '>>>': Nodes.UnsignedRightShiftOp
        , '+': Nodes.AddOp
        , '-': Nodes.SubtractOp
        , '*': Nodes.MultiplyOp
        , '/': Nodes.DivideOp
        , '%': Nodes.RemOp
        , '.': Nodes.MemberAccessOp
        , '?.': Nodes.SoakedMemberAccessOp
        , '::': Nodes.ProtoMemberAccessOp
        , '?::': Nodes.SoakedProtoMemberAccessOp
        , '[': Nodes.DynamicMemberAccessOp
        , '?[': Nodes.SoakedDynamicMemberAccessOp
        , '::[': Nodes.DynamicProtoMemberAccessOp
        , '?::[': Nodes.SoakedDynamicProtoMemberAccessOp
        },
      foldl = function(fn, memo, list){
        for(var i = 0, l = list.length; i < l; ++i)
          memo = fn(memo, list[i]);
        return memo;
      };
}

// TODO: DRY everything!

start
  = ws0:_ result:statement* ws1:_ {
      return new Nodes.Program(new Nodes.Block(result)).r(ws0 + result.raw + ws1).p(line, column);
    }

statement
  = result:expression "\n"? { return result; }

expression
  = left:postfixControlFlowExpression right:(_ ";" _ expression)? {
      if(!right) return left;
      var raw = left.raw + right[0] + right[1] + right[2] + right[3].raw;
      return new Nodes.SeqOp(left, right[3]).r(raw).p(line, column);
    }

postfixControlFlowOp
  = (IF / UNLESS) _ assignmentExpression
  / (WHILE / UNTIL) _ assignmentExpression
  / FOR _ val:Assignable _ key:("," _ key:Assignable _ { return key; })? IN _ expr:assignmentExpression
  / FOR _ own:(OWN _)? key:Assignable _ val:("," _ val:Assignable _ { return val; })? OF _ expr:assignmentExpression
postfixControlFlowExpression = expr:assignmentExpression postfixes:(_ postfixControlFlowOp)* {
    return foldl(function(expr, pair){
      var raw, ws = pair[0], postfix = pair[1], condition;
      switch(postfix[1]){
        case 'if':
          condition = postfix[2];
          raw = expr.raw + ws + 'if' + postfix[1] + condition.raw;
          return new Nodes.Conditional(condition, expr, null).r(raw).p(line, column)
        case 'unless':
          condition = new Nodes.NotOp(postfix[2]).r('not (' + postfix[2].raw + ')').p(postfix[2].line, postfix[2].column);
          raw = expr.raw + ws + 'unless' + postfix[1] + condition.raw;
          return new Nodes.Conditional(condition, expr, null).r(raw).p(line, column)
        case 'while':
          condition = postfix[2];
          raw = expr.raw + ws + 'while' + postfix[1] + condition.raw;
          return new Nodes.While(condition, expr).r(raw).p(line, column)
        case 'unless':
          condition = new Nodes.NotOp(postfix[2]).r('not (' + postfix[2].raw + ')').p(postfix[2].line, postfix[2].column);
          raw = expr.raw + ws + 'unless' + postfix[1] + condition.raw;
          return new Nodes.While(condition, expr).r(raw).p(line, column)
        // TODO: for-in, for-of
      }
    }, expr, postfixes)
  }

assignmentExpression = assignmentOp / compoundAssignmentOp / logicalOrExpression
  assignmentOp = all:(Assignable _ "=" !"=" _ logicalOrExpression) {
      var raw = all[0].raw + all[1] + all[2] + all[4] + all[5].raw;
      return new Nodes.AssignOp(all[0], all[5]).r(raw).p(lines, column);
    }
  CompoundAssignmentOperators = "*" / "/" / "%" / "+" / "-" / "<<" / ">>" / ">>>" / "&" / "^" / "|" / "and" / "or" / "&&" / "||" / "?"
  compoundAssignmentOp = all:(Assignable _ CompoundAssignmentOperators "=" _ logicalOrExpression) {
      var raw = all[0].raw + all[1] + all[2] + "=" + all[4] + all[5].raw;
      return new Nodes.CompoundAssignOp(constructorLookup[all[2]], all[0], all[5]).r(raw).p(lines, column);
    }
logicalOrExpression = left:logicalAndExpression right:(_ ("||" / OR) !"=" _ logicalOrExpression)? {
    if(!right) return left;
    var raw = left.raw + right[0] + right[1] + right[3] + right[4].raw;
    return new Nodes.OrOp(left, right[4]).r(raw).p(line, column);
  }
logicalAndExpression = left:bitwiseOrExpression right:(_ ("&&" / AND) !"=" _ logicalAndExpression)? {
    if(!right) return left;
    var raw = left.raw + right[0] + right[1] + right[3] + right[4].raw;
    return new Nodes.AndOp(left, right[4]).r(raw).p(line, column);
  }
bitwiseOrExpression = left:bitwiseXorExpression right:(_ "|" !"=" _ bitwiseOrExpression)? {
    if(!right) return left;
    var raw = left.raw + right[0] + right[1] + right[3] + right[4].raw;
    return new Nodes.BitOrOp(left, right[4]).r(raw).p(line, column);
  }
bitwiseXorExpression = left:bitwiseAndExpression right:(_ "^" !"=" _ bitwiseXorExpression)? {
    if(!right) return left;
    var raw = left.raw + right[0] + right[1] + right[3] + right[4].raw;
    return new Nodes.BitXorOp(left, right[4]).r(raw).p(line, column);
  }
bitwiseAndExpression = left:existentialExpression right:(_ "&" !"=" _ bitwiseAndExpression)? {
    if(!right) return left;
    var raw = left.raw + right[0] + right[1] + right[3] + right[4].raw;
    return new Nodes.BitAndOp(left, right[4]).r(raw).p(line, column);
  }
existentialExpression = left:equalityExpression right:(_ "?" !"=" _ existentialExpression)? {
    if(!right) return left;
    var raw = left.raw + right[0] + right[1] + right[3] + right[4].raw;
    return new Nodes.ExistsOp(left, right[4]).r(raw).p(line, column);
  }
equalityExpression = left:relationalExpression right:(_ ("==" / IS / "!=" / ISNT) _ equalityExpression)? {
    if(!right) return left;
    var raw = left.raw + right[0] + right[1] + right[2] + right[3].raw;
    return new constructorLookup[right[1]](left, right[3]).r(raw).p(line, column);
  }
relationalExpression = left:bitwiseShiftExpression right:(_ ("<=" / ">=" / "<" / ">" / INSTANCEOF / IN / OF) _ relationalExpression)? {
    if(!right) return left;
    var op = constructorLookup[right[1]],
        raw = left.raw + right[0] + right[1] + right[2] + right[3].raw;
    return new op(left, right[3]).r(raw).p(line, column);
  }
bitwiseShiftExpression = left:additiveExpression right:(_ ("<<" / ">>>" / ">>") _ bitwiseShiftExpression)? {
    if(!right) return left;
    var op = constructorLookup[right[1]],
        raw = left.raw + right[0] + right[1] + right[2] + right[3].raw;
    return new op(left, right[3]).r(raw).p(line, column);
  }
additiveExpression = left:multiplicativeExpression right:(_ ("+" ![+=] / "-" ![-=]) _ additiveExpression)? {
    if(!right) return left;
    var op = constructorLookup[right[1][0]],
        raw = left.raw + right[0] + right[1][0] + right[2] + right[3].raw;
    return new op(left, right[3]).r(raw).p(line, column);
  }
multiplicativeExpression = left:prefixExpression right:(_ [*/%] !"=" _ multiplicativeExpression)? {
    if(!right) return left;
    var op = constructorLookup[right[1]],
        raw = left.raw + right[0] + right[1] + right[3] + right[4].raw;
    return new op(left, right[4]).r(raw).p(line, column);
  }
prefixExpression
  = postfixExpression
  / "++" _ prefixExpression
  / "--" _ prefixExpression
  / "+" _ prefixExpression
  / "-" _ prefixExpression
  / ("!" / NOT) _ prefixExpression
  / "~" _ prefixExpression
  / DO _ prefixExpression
  / TYPEOF _ prefixExpression
  / DELETE _ prefixExpression
postfixExpression = expr:leftHandSideExpression ops:("?" / "[..]" / "++" / "--")*{
    return foldl(function(expr, op){
      var raw;
      switch(op){
        case '?': return new UnaryExistsOp(expr).r(expr.raw + op).p(line, column)
        case '[..]': return new ShallowCopyArray(expr).r(expr.raw + op).p(line, column)
        case '++': return new PostIncrementOp(expr).r(expr.raw + op).p(line, column)
        case '--': return new PostDecrementOp(expr).r(expr.raw + op).p(line, column)
      }
    }, expr, ops);
  }
leftHandSideExpression
  = memberExpression ("(" _ argumentList? _ ")") ("(" _ argumentList? _ ")" / MemberAccessOps)
  / newExpression
newExpression
  = memberExpression
  / NEW _ newExpression
memberExpression = expr:primaryExpression accesses:(_ MemberAccessOps)* {
    return foldl(function(expr, pair){
      var raw, ws = pair[0], access = pair[1];
      switch(access[0]){
        case '.':
        case '?.':
        case '::':
        case '?::':
          raw = expr.raw + ws + access[0] + access[1] + access[2].raw;
          break;
        case '[':
        case '?[':
        case '::[':
        case '?::[':
          raw = expr.raw + ws + access[0] + access[1] + access[2].raw + access[3] + ']';
          break;
      }
      return new constructorLookup[access[0]](expr, access[2]).r(raw).p(line, column)
    }, expr, accesses);
  }
  MemberNames
    = i:identifierName { return new Nodes.Identifier(i).r(i).p(line, column); }
  MemberAccessOps = memberAccessOp / soakedMemberAccessOp / dynamicMemberAccessOp / soakedDynamicMemberAccessOp / protoMemberAccessOp / dynamicProtoMemberAccessOp / soakedProtoMemberAccessOp / soakedDynamicProtoMemberAccessOp
    memberAccessOp = "." _ MemberNames
    soakedMemberAccessOp = "?." _ MemberNames
    dynamicMemberAccessOp = "[" _ expression _ "]"
    soakedDynamicMemberAccessOp = "?[" _ expression _ "]"
    protoMemberAccessOp = "::" _ MemberNames
    dynamicProtoMemberAccessOp = "::[" _ expression _ "]"
    soakedProtoMemberAccessOp = "?::" _ MemberNames
    soakedDynamicProtoMemberAccessOp = "?::[" _ expression _ "]"
primaryExpression = THIS / identifier / Literals / "(" _ expression _ ")"



argumentList = assignmentExpression _ ("," _ assignmentExpression)*


Literals = Numbers / bool / identifier

bool
  = match:(TRUE / YES / ON) { return new Nodes.Bool(true).r(match).p(line, column); }
  / match:(FALSE / NO / OFF) { return new Nodes.Bool(false).r(match).p(line, column); }

Numbers
  = "0b" bs:bit+ { return new Nodes.Int(parseInt(bs.join(''), 2)).r("0b" + bs).p(line, column); }
  / "0o" os:octalDigit+ { return new Nodes.Int(parseInt(os.join(''), 8)).r("0o" + os).p(line, column); }
  / "0x" hs:hexDigit+ { return new Nodes.Int(parseInt(hs.join(''), 16)).r("0x" + hs).p(line, column); }
  / base:decimal e:("e" / "E") sign:("+" / "-")? exponent:decimal {
      var raw = base + e + sign + exponent
      return new Nodes.Float(parseFloat(raw, 10)).r(raw).p(line, column);
    }
  / decimal

decimal
  // trailing and leading radix points are discouraged anyway
  = integral:integer fractional:("." decimalDigit+)? {
      if(fractional != null) fractional = "." + fractional[1].join('');
      return fractional == null
        ? new Nodes.Int(+integral).r(integral).p(line, column)
        : new Nodes.Float(parseFloat(integral + fractional, 10)).r(integral + fractional).p(line, column);
    }

integer
  = "0" / a:[1-9] bs:decimalDigit+ { return a + bs.join(''); }


decimalDigit = [0-9]
hexDigit = [0-9a-fA-F]
octalDigit = [0-7]
bit = [01]


unassignable = ("arguments" / "eval") !identifierPart
Assignable
  = !unassignable identifier
  / memberExpression


// identifiers

JSKeywords
  = ("true" / "false" / "null" / "this" / "new" / "delete" / "typeof" / "in" /
  "instanceof" "return" / "throw" / "break" / "continue" / "debugger" / "if" /
  "else" / "switch" / "for" / "while" / "do" / "try" / "catch" / "finally" /
  "class" / "extends" / "super") !identifierPart

UnusedJSKeywords
  = ("case" / "default" / "function" / "var" / "void" / "with" / "const" /
  "let" / "enum" / "export" / "import" / "native" "implements" / "interface" /
  "package" / "private" / "protected" / "public" / "static" / "yield") !identifierPart

CSKeywords
  = ("undefined" / "then" / "unless" / "until" / "loop" / "of" / "by" / "when" /
  "and" / "or" / "is" / "isnt" / "not" / "yes" / "no" / "on" / "off") !identifierPart

reserved = JSKeywords / CSKeywords / UnusedJSKeywords

identifier = !reserved identifierName
identifierName = identifierStart identifierPart*
identifierStart = UnicodeLetter / [$_] / "\\" UnicodeEscapeSequence
identifierPart
  = identifierStart / UnicodeCombiningMark / UnicodeDigit /
  UnicodeConnectorPunctuation / ZWNJ / ZWJ

UnicodeLetter = [a-zA-Z] // TODO
UnicodeEscapeSequence = "u" hexDigit hexDigit hexDigit hexDigit
UnicodeCombiningMark = "_" // TODO
UnicodeDigit = [0-9] // TODO
UnicodeConnectorPunctuation = "$" // TODO
ZWNJ = "\u200C"
ZWJ = "\u200D"


AND = w:"AND" !identifierPart { return w; }
DELETE = w:"delete" !identifierPart { return w; }
DO = w:"do" !identifierPart { return w; }
FALSE = w:"false" !identifierPart { return w; }
FOR = w:"for" !identifierPart { return w; }
IF = w:"if" !identifierPart { return w; }
IN = w:"in" !identifierPart { return w; }
INSTANCEOF = w:"instanceof" !identifierPart { return w; }
IS = w:"is" !identifierPart { return w; }
ISNT = w:"isnt" !identifierPart { return w; }
NEW = w:"new" !identifierPart { return w; }
NO = w:"no" !identifierPart { return w; }
NOT = w:"not" !identifierPart { return w; }
OF = w:"of" !identifierPart { return w; }
OFF = w:"off" !identifierPart { return w; }
ON = w:"on" !identifierPart { return w; }
OR = w:"or" !identifierPart { return w; }
OWN = w:"own" !identifierPart { return w; }
THIS = w:"this" !identifierPart { return w; }
TRUE = w:"true" !identifierPart { return w; }
TYPEOF = w:"typeof" !identifierPart { return w; }
UNLESS = w:"unless" !identifierPart { return w; }
UNTIL = w:"until" !identifierPart { return w; }
WHILE = w:"while" !identifierPart { return w; }
YES = w:"yes" !identifierPart { return w; }


// whitespace / indentation

_ = ws:whitespace* { return ws.join(''); }
__ = whitespace+

whitespace = " "
