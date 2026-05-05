package expression

import (
	"fmt"
	"math"
	"math/rand"
	"strconv"
	"strings"
)

const RandomMax = 100

type Env struct {
	ScreenX  float64
	ScreenY  float64
	ScreenW  float64
	ScreenH  float64
	AreaX    float64
	AreaY    float64
	AreaW    float64
	AreaH    float64
	DesktopX float64
	DesktopY float64
	DesktopW float64
	DesktopH float64
	ImageW   float64
	ImageH   float64
	ImageX   float64
	ImageY   float64
	Random   float64
	RandS    float64
}

// ExprNode represents a node in the expression AST
type ExprNode interface {
	eval(env *Env) (float64, error)
}

// NumberNode represents a numeric literal
type NumberNode struct {
	value float64
}

func (n *NumberNode) eval(env *Env) (float64, error) {
	return n.value, nil
}

// VariableNode represents a variable reference
type VariableNode struct {
	name string
}

func (n *VariableNode) eval(env *Env) (float64, error) {
	switch n.name {
	case "screenX":
		return env.ScreenX, nil
	case "screenY":
		return env.ScreenY, nil
	case "screenW":
		return env.ScreenW, nil
	case "screenH":
		return env.ScreenH, nil
	case "areaX":
		return env.AreaX, nil
	case "areaY":
		return env.AreaY, nil
	case "areaW":
		return env.AreaW, nil
	case "areaH":
		return env.AreaH, nil
	case "desktopX":
		return env.DesktopX, nil
	case "desktopY":
		return env.DesktopY, nil
	case "desktopW":
		return env.DesktopW, nil
	case "desktopH":
		return env.DesktopH, nil
	case "imageW":
		return env.ImageW, nil
	case "imageH":
		return env.ImageH, nil
	case "imageX":
		return env.ImageX, nil
	case "imageY":
		return env.ImageY, nil
	case "random":
		return env.Random, nil
	case "randS":
		return env.RandS, nil
	}
	return 0, fmt.Errorf("unknown variable %q", n.name)
}

// UnaryOpNode represents a unary operation (+, -)
type UnaryOpNode struct {
	op   string
	expr ExprNode
}

func (n *UnaryOpNode) eval(env *Env) (float64, error) {
	val, err := n.expr.eval(env)
	if err != nil {
		return 0, err
	}
	if n.op == "-" {
		return -val, nil
	}
	return val, nil
}

// BinaryOpNode represents a binary operation (+, -, *, /)
type BinaryOpNode struct {
	left  ExprNode
	op    string
	right ExprNode
}

func (n *BinaryOpNode) eval(env *Env) (float64, error) {
	left, err := n.left.eval(env)
	if err != nil {
		return 0, err
	}
	right, err := n.right.eval(env)
	if err != nil {
		return 0, err
	}
	switch n.op {
	case "+":
		return left + right, nil
	case "-":
		return left - right, nil
	case "*":
		return left * right, nil
	case "/":
		if right == 0 {
			return 0, fmt.Errorf("division by zero")
		}
		return left / right, nil
	}
	return 0, fmt.Errorf("unknown operator %q", n.op)
}

// ParsedExpr holds a pre-parsed expression AST
type ParsedExpr struct {
	root    ExprNode
	exprStr string
}

// String returns the original expression string
func (p *ParsedExpr) String() string {
	if p == nil {
		return ""
	}
	return p.exprStr
}

// Eval evaluates a pre-parsed expression with the given environment
func (p *ParsedExpr) Eval(env *Env) (float64, error) {
	if p == nil || p.root == nil {
		return 0, nil
	}
	return p.root.eval(env)
}

// EvalInt evaluates a pre-parsed expression and returns an integer
func (p *ParsedExpr) EvalInt(env *Env) (int, error) {
	v, err := p.Eval(env)
	if err != nil {
		return 0, err
	}
	return int(v), nil
}

// Parse parses an expression string into a ParsedExpr (cached AST)
func Parse(expr string) (*ParsedExpr, error) {
	original := strings.TrimSpace(expr)
	if original == "" {
		return &ParsedExpr{root: &NumberNode{value: 0}, exprStr: ""}, nil
	}
	node, err := parseExpr(original)
	if err != nil {
		return nil, err
	}
	return &ParsedExpr{root: node, exprStr: original}, nil
}

// parseExpr parses an expression string into an AST node
func parseExpr(expr string) (ExprNode, error) {
	expr = strings.TrimSpace(expr)

	// Handle unary operators at the start
	if len(expr) > 0 && (expr[0] == '+' || expr[0] == '-') {
		op := string(expr[0])
		rest := strings.TrimSpace(expr[1:])
		inner, err := parseExpr(rest)
		if err != nil {
			return nil, err
		}
		return &UnaryOpNode{op: op, expr: inner}, nil
	}

	// Remove outermost parentheses if they wrap the entire expression
	for len(expr) > 0 && expr[0] == '(' && expr[len(expr)-1] == ')' {
		depth := 0
		matches := true
		for i := 0; i < len(expr)-1; i++ {
			if expr[i] == '(' {
				depth++
			} else if expr[i] == ')' {
				depth--
			}
			if depth == 0 {
				matches = false
				break
			}
		}
		if matches {
			expr = strings.TrimSpace(expr[1 : len(expr)-1])
		} else {
			break
		}
	}

	// Find the last lowest-precedence operator (+, -) that is not inside parentheses
	splitIdx := -1
	op := ""
	depth := 0
	for i := len(expr) - 1; i >= 0; i-- {
		c := expr[i]
		if c == ')' {
			depth++
		} else if c == '(' {
			depth--
		} else if depth == 0 {
			if (c == '+' || c == '-') && i > 0 {
				splitIdx = i
				op = string(c)
				break
			}
		}
	}

	// If no +, - found, look for *, /
	if splitIdx == -1 {
		depth = 0
		for i := len(expr) - 1; i >= 0; i-- {
			c := expr[i]
			if c == ')' {
				depth++
			} else if c == '(' {
				depth--
			} else if depth == 0 {
				if (c == '*' || c == '/') && i > 0 {
					splitIdx = i
					op = string(c)
					break
				}
			}
		}
	}

	if splitIdx != -1 {
		leftStr := strings.TrimSpace(expr[:splitIdx])
		rightStr := strings.TrimSpace(expr[splitIdx+1:])
		left, err := parseExpr(leftStr)
		if err != nil {
			return nil, err
		}
		right, err := parseExpr(rightStr)
		if err != nil {
			return nil, err
		}
		return &BinaryOpNode{left: left, op: op, right: right}, nil
	}

	// No operators found, handle as literal or variable
	if val, err := strconv.ParseFloat(expr, 64); err == nil {
		return &NumberNode{value: val}, nil
	}

	// Check if it's a variable
	switch expr {
	case "screenX", "screenY", "screenW", "screenH",
		"areaX", "areaY", "areaW", "areaH",
		"desktopX", "desktopY", "desktopW", "desktopH",
		"imageW", "imageH", "imageX", "imageY",
		"random", "randS":
		return &VariableNode{name: expr}, nil
	}

	return nil, fmt.Errorf("unknown expression %q", expr)
}

func NewEnv() *Env {
	return &Env{
		Random: float64(rand.Intn(RandomMax)),
		RandS:  float64(rand.Intn(RandomMax)),
	}
}

func (e *Env) RegenerateRandom() {
	e.Random = float64(rand.Intn(RandomMax))
	e.RandS = float64(rand.Intn(RandomMax))
}

func Clamp(v, min, max float64) float64 {
	return math.Max(min, math.Min(max, v))
}

func Lerp(a, b, t float64) float64 {
	return a + (b-a)*t
}
