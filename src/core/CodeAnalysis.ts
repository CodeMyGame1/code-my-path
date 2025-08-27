import { Parser, Language, Node } from "web-tree-sitter";

function fetchAutonFunc(parser: Parser, cppCode: string): [string, Node] | null {
  const tree = parser.parse(cppCode);
  if (!tree) return null;

  const rootNode = tree.rootNode;

  // Assumes first "child" (code block) in the uploaded code is a function
  // declaration.
  const autonFunction = rootNode.namedChild(0);
  if (!autonFunction || autonFunction.type !== "function_definition") {
    return null;
  }

  const autonName = autonFunction.namedChild(1)?.text;
  const autonCode = autonFunction.namedChild(2);

  // TODO: When would `auton_name` be null?
  if (!autonName || !autonCode) return null;

  return [autonName, autonCode];
}

function fetchPathPoints(autonInfo: [string, Node]): [number, number][] {
  const autonName = autonInfo[0];
  const autonCode = autonInfo[1];

  console.log(`parsing auton: ${autonName}`);

  const autonPoints: [number, number][] = [];

  // Runs through each line of code in the function.
  autonCode.namedChildren.forEach(statement => {
    if (!statement) return;

    // Discards comments and other non-expressions.
    if (statement.type !== "expression_statement") return;

    const functionCall = statement.namedChild(0);
    if (!functionCall) return;

    const functionName = functionCall.namedChild(0)?.text;
    if (!functionName) return;

    // Only checks functions which influence the robot's position.

    // Function signatures (for reference):
    // void setPose(float x, float y, float theta, bool radians = false)
    // void moveToPose(float x, float y, float theta, int timeout, MoveToPoseParams params = {}, bool async = true)
    // void moveToPoint(float x, float y, int timeout, MoveToPointParams params = {}, bool async = true)
    if (
      functionName !== "chassis.setPose" &&
      functionName !== "chassis.moveToPose" &&
      functionName !== "chassis.moveToPoint"
    )
      return;

    const parameters = functionCall.child(1);
    if (!parameters) return;

    const args = parameters.namedChildren;
    if (!args[0] || !args[1]) return;
    let [x, y] = [parseFloat(args[0].text), parseFloat(args[1].text)];

    autonPoints.push([x, y]);
  });

  return autonPoints;
}

export default async function parseCode(cppCode: string): Promise<[number, number][] | null> {
  await Parser.init();

  const parser = new Parser();
  const CppLang = await Language.load("/static/tree-sitter-cpp.wasm");

  parser.setLanguage(CppLang);

  const autonInfo = fetchAutonFunc(parser, cppCode);
  if (!autonInfo) return null;

  const pathPoints = fetchPathPoints(autonInfo);
  return pathPoints;
}
