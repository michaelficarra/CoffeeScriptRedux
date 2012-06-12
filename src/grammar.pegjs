{
  var Nodes = require("./lib/coffee-script/nodes");
}

start
  = _ result:statement* _ { return result; }

statement
  = result:expression "\n"? { return result; }

expression
  = postfixControlFlowExpression (_ ";" _ postfixControlFlowExpression)*

postfixControlFlowOp
  = op:(IF / UNLESS) _ assignmentExpression
  / op:(WHILE / UNTIL) _ assignmentExpression
  / FOR _ val:Assignable _ key:("," _ key:Assignable _ { return key; })? IN _ expr:assignmentExpression
  / FOR _ own:(OWN _)? key:Assignable _ val:("," _ val:Assignable _ { return val; })? OF _ expr:assignmentExpression
postfixControlFlowExpression
  = assignmentExpression (_ postfixControlFlowOp)*

CompoundAssignmentOperators = ("*" / "/" / "%" / "+" / "-" / "<<" / ">>" / ">>>" / "&" / "^" / "|" / "and" / "or" / "&&" / "||" / "?") "="
  assignmentOp = Assignable _ ("=" !"=") _ logicalOrExpression
  compoundAssignmentOp = Assignable _ CompoundAssignmentOperators _ logicalOrExpression
assignmentExpression = assignmentOp / compoundAssignmentOp / logicalOrExpression
logicalOrExpression = logicalAndExpression (_ ("||" !"=" / OR) _ logicalAndExpression)*
logicalAndExpression = bitwiseOrExpression (_ ("&&" !"=" / AND) _ bitwiseOrExpression)*
bitwiseOrExpression = bitwiseXorExpression (_ "|" !"=" _ bitwiseXorExpression)*
bitwiseXorExpression = bitwiseAndExpression (_ "^" !"=" _ bitwiseAndExpression)*
bitwiseAndExpression = existentialExpression (_ "&" !"=" _ existentialExpression)*
existentialExpression = equalityExpression (_ "?" !"=" _ equalityExpression)*
equalityExpression = relationalExpression (_ ("==" / IS / "!=" / ISNT) _ relationalExpression)*
relationalExpression = bitwiseShiftExpression (_ ([<>] "="? / INSTANCEOF / IN / OF) _ bitwiseShiftExpression)*
bitwiseShiftExpression = additiveExpression (_ ("<<" / ">>" ">"?) _ additiveExpression)*
additiveExpression = multiplicativeExpression (_ ("+" ![+=] / "-" ![-=]) _ multiplicativeExpression)*
multiplicativeExpression = prefixExpression (_ ([*/%]) !"=" _ prefixExpression)*
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
postfixExpression = leftHandSideExpression ("?" / "[..]" / "++" / "--")*
leftHandSideExpression
  = memberExpression (_ "(" _ argumentList? _ ")")*
  / newExpression
newExpression
  = memberExpression
  / NEW _ newExpression
memberExpression = primaryExpression (_ MemberAccessOps)*
primaryExpression = THIS / identifier / Literals / "(" _ expression _ ")"


MemberNames
  = identifierName
MemberAccessOps = memberAccessOp / soakedMemberAccessOp / dynamicMemberAccessOp / soakedDynamicMemberAccessOp / protoMemberAccessOp / dynamicProtoMemberAccessOp / soakedProtoMemberAccessOp / soakedDynamicProtoMemberAccessOp
  memberAccessOp = "." MemberNames
  soakedMemberAccessOp = "?." MemberNames
  dynamicMemberAccessOp = "[" expression "]"
  soakedDynamicMemberAccessOp = "?[" expression "]"
  protoMemberAccessOp = "::" MemberNames
  dynamicProtoMemberAccessOp = "::[" expression "]"
  soakedProtoMemberAccessOp = "?::" MemberNames
  soakedDynamicProtoMemberAccessOp = "?::[" expression "]"
argumentList = assignmentExpression _ ("," _ assignmentExpression)*


Literals
  = Numbers
  / bool
  / identifier

bool
  = match:(TRUE / YES / ON) { return new Nodes.Bool(true).r(match).p(line, column); }
  / match:(FALSE / NO / OFF) { return new Nodes.Bool(false).r(match).p(line, column); }

Numbers
  = "0b" bs:bit+ { return parseInt(bs.join(''), 2); }
  / "0o" os:octalDigit+ { return parseInt(os.join(''), 8); }
  / "0x" hs:hexDigit+ { return parseInt(hs.join(''), 16); }
  / base:decimal ("e" / "E") sign:("+" / "-")? exponent:decimal {
      return base + "e" + sign + exponent
    }
  / decimal

decimal
  // trailing and leading radix points are discouraged anyway
  = integral:decimalDigit+ fractional:("." decimalDigit+)? {
      return parseInt(integral + fractional, 10);
    }

decimalDigit = [0-9]
hexDigit = [0-9a-fA-F]
octalDigit = [0-7]
bit = [01]


// LogicOps = andOp / orOp
// BitOps = bitAndOp / bitOrOp / bitXorOp / leftShiftOp / signedRightShiftOp / unsignedRightShiftOp
// MathsOps = addOp / subtractOp / multiplyOp / divideOp / remOp
// ComparisonOps = LTOp / LTEOp / GTOp / GTEOp / EQOp / NEQOp


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
  "let" / "package" / "private" / "protected" / "public" / "static" / "yield")
  !identifierPart

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


AND = "AND" !identifierPart
DELETE = "delete" !identifierPart
DO = "do" !identifierPart
FALSE = "false" !identifierPart
FOR = "for" !identifierPart
IF = "if" !identifierPart
IN = "in" !identifierPart
INSTANCEOF = "instanceof" !identifierPart
IS = "is" !identifierPart
ISNT = "isnt" !identifierPart
NEW = "new" !identifierPart
NO = "no" !identifierPart
NOT = "not" !identifierPart
OF = "of" !identifierPart
OFF = "off" !identifierPart
ON = "on" !identifierPart
OR = "or" !identifierPart
OWN = "own" !identifierPart
THIS = "this" !identifierPart
TRUE = "true" !identifierPart
TYPEOF = "typeof" !identifierPart
UNLESS = "unless" !identifierPart
UNTIL = "until" !identifierPart
WHILE = "while" !identifierPart
YES = "yes" !identifierPart


// whitespace / indentation

_ = whitespace*
__ = whitespace+

whitespace = " "
