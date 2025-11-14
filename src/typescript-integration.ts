import * as ts from 'typescript';
import * as fs from 'fs-extra';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { OperationResult } from './types.js';

export class TypeScriptIntegration {
  private program: ts.Program | null = null;
  private checker: ts.TypeChecker | null = null;

  constructor(private repoPath: string) {}

  async initialize(): Promise<void> {
    const configPath = this.findTSConfig();
    if (!configPath) {
      throw new Error('No TypeScript configuration found');
    }

    const config = this.loadTSConfig(configPath);
    this.program = ts.createProgram(config.fileNames, config.options);
    this.checker = this.program.getTypeChecker();
  }

  async findAllReferences(symbolName: string, fileName: string): Promise<Array<{
    file: string;
    line: number;
    column: number;
    text: string;
  }>> {
    if (!this.program || !this.checker) {
      throw new Error('TypeScript integration not initialized');
    }

    const sourceFile = this.program.getSourceFile(fileName);
    if (!sourceFile) {
      throw new Error(`Source file not found: ${fileName}`);
    }

    const references: Array<{
      file: string;
      line: number;
      column: number;
      text: string;
    }> = [];

    const findSymbol = (node: ts.Node) => {
      if (ts.isIdentifier(node) && node.text === symbolName) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.pos);
        references.push({
          file: fileName,
          line: line + 1,
          column: character + 1,
          text: node.text
        });
      }
      ts.forEachChild(node, findSymbol);
    };

    findSymbol(sourceFile);
    return references;
  }

  async validateSymbolRename(
    oldName: string,
    newName: string,
    fileName: string
  ): Promise<OperationResult> {
    if (!this.program || !this.checker) {
      return {
        success: false,
        message: 'TypeScript integration not initialized'
      };
    }

    try {
      const sourceFile = this.program.getSourceFile(fileName);
      if (!sourceFile) {
        return {
          success: false,
          message: `Source file not found: ${fileName}`
        };
      }

      // Check if the new name would conflict with existing symbols
      const conflicts = this.findSymbolConflicts(newName, sourceFile);
      if (conflicts.length > 0) {
        return {
          success: false,
          message: `Symbol '${newName}' conflicts with existing symbols`,
          details: { conflicts }
        };
      }

      // Validate that the new name is a valid identifier
      if (!this.isValidIdentifier(newName)) {
        return {
          success: false,
          message: `'${newName}' is not a valid TypeScript identifier`
        };
      }

      return {
        success: true,
        message: `Rename from '${oldName}' to '${newName}' is valid`
      };

    } catch (error) {
      return {
        success: false,
        message: `Validation failed: ${error}`,
        details: error
      };
    }
  }

  async extractFunction(
    fileName: string,
    startLine: number,
    endLine: number,
    newFunctionName: string
  ): Promise<OperationResult> {
    if (!this.program) {
      return {
        success: false,
        message: 'TypeScript integration not initialized'
      };
    }

    try {
      const sourceFile = this.program.getSourceFile(fileName);
      if (!sourceFile) {
        return {
          success: false,
          message: `Source file not found: ${fileName}`
        };
      }

      const fileContent = await readFile(fileName, 'utf-8');
      const lines = fileContent.split('\n');

      // Extract the selected lines
      const selectedLines = lines.slice(startLine - 1, endLine);
      const selectedText = selectedLines.join('\n');

      // Parse the selected text to understand the code structure
      const tempSourceFile = ts.createSourceFile(
        'temp.ts',
        selectedText,
        ts.ScriptTarget.Latest,
        true
      );

      // Analyze variables used in the selection
      const analysis = this.analyzeCodeSelection(tempSourceFile, sourceFile);

      // Generate function signature
      const functionSignature = this.generateFunctionSignature(
        newFunctionName,
        analysis.parameters,
        analysis.returnType
      );

      // Generate the new function
      const newFunction = `${functionSignature} {\n${selectedText}\n}`;

      // Generate the function call to replace the selected code
      const functionCall = this.generateFunctionCall(newFunctionName, analysis.parameters);

      return {
        success: true,
        message: `Function extraction analyzed for '${newFunctionName}'`,
        details: {
          newFunction,
          functionCall,
          parameters: analysis.parameters,
          returnType: analysis.returnType
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Function extraction failed: ${error}`,
        details: error
      };
    }
  }

  async analyzeImports(fileName: string): Promise<{
    imports: Array<{
      module: string;
      namedImports: string[];
      defaultImport?: string;
      namespaceImport?: string;
    }>;
    exports: Array<{
      name: string;
      type: 'named' | 'default';
    }>;
  }> {
    if (!this.program) {
      throw new Error('TypeScript integration not initialized');
    }

    const sourceFile = this.program.getSourceFile(fileName);
    if (!sourceFile) {
      throw new Error(`Source file not found: ${fileName}`);
    }

    const imports: Array<{
      module: string;
      namedImports: string[];
      defaultImport?: string;
      namespaceImport?: string;
    }> = [];

    const exports: Array<{
      name: string;
      type: 'named' | 'default';
    }> = [];

    const visitor = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
        const importClause = node.importClause;

        if (importClause) {
          const importInfo: any = {
            module: moduleSpecifier,
            namedImports: []
          };

          if (importClause.name) {
            importInfo.defaultImport = importClause.name.text;
          }

          if (importClause.namedBindings) {
            if (ts.isNamespaceImport(importClause.namedBindings)) {
              importInfo.namespaceImport = importClause.namedBindings.name.text;
            } else if (ts.isNamedImports(importClause.namedBindings)) {
              importInfo.namedImports = importClause.namedBindings.elements.map(
                element => element.name.text
              );
            }
          }

          imports.push(importInfo);
        }
      }

      if (ts.isExportDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
        // Handle exports
        if (ts.isExportDeclaration(node)) {
          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            node.exportClause.elements.forEach(element => {
              exports.push({
                name: element.name.text,
                type: 'named'
              });
            });
          }
        } else if (node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) {
          if (node.name) {
            const isDefault = node.modifiers.some(mod => mod.kind === ts.SyntaxKind.DefaultKeyword);
            exports.push({
              name: node.name.text,
              type: isDefault ? 'default' : 'named'
            });
          }
        }
      }

      ts.forEachChild(node, visitor);
    };

    visitor(sourceFile);

    return { imports, exports };
  }

  private findTSConfig(): string | null {
    let currentDir = this.repoPath;

    while (currentDir !== path.parse(currentDir).root) {
      const configPath = path.join(currentDir, 'tsconfig.json');
      if (fs.existsSync(configPath)) {
        return configPath;
      }
      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  private loadTSConfig(configPath: string): {
    fileNames: string[];
    options: ts.CompilerOptions;
  } {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(`Error reading tsconfig.json: ${configFile.error.messageText}`);
    }

    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    );

    if (parsedConfig.errors.length > 0) {
      throw new Error(`Error parsing tsconfig.json: ${parsedConfig.errors[0].messageText}`);
    }

    return {
      fileNames: parsedConfig.fileNames,
      options: parsedConfig.options
    };
  }

  private findSymbolConflicts(symbolName: string, sourceFile: ts.SourceFile): string[] {
    const conflicts: string[] = [];

    const visitor = (node: ts.Node) => {
      if (ts.isIdentifier(node) && node.text === symbolName) {
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent) ||
            ts.isFunctionDeclaration(parent) ||
            ts.isClassDeclaration(parent)) {
          conflicts.push(`${symbolName} at line ${sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1}`);
        }
      }
      ts.forEachChild(node, visitor);
    };

    visitor(sourceFile);
    return conflicts;
  }

  private isValidIdentifier(name: string): boolean {
    const reservedWords = [
      'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
      'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import',
      'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true',
      'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'implements',
      'interface', 'package', 'private', 'protected', 'public', 'async', 'await'
    ];
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) && !reservedWords.includes(name);
  }

  private analyzeCodeSelection(
    tempSourceFile: ts.SourceFile,
    _originalSourceFile: ts.SourceFile
  ): {
    parameters: Array<{ name: string; type: string }>;
    returnType: string;
  } {
    const parameters: Array<{ name: string; type: string }> = [];
    const usedVariables = new Set<string>();
    const definedVariables = new Set<string>();
    const builtIns = new Set(['console', 'Math', 'Date', 'Array', 'Object', 'String', 'Number',
      'Boolean', 'undefined', 'null', 'true', 'false', 'this', 'window', 'document', 'process']);

    // Find all identifiers used in the selection
    const findUsed = (node: ts.Node) => {
      if (ts.isIdentifier(node) && !builtIns.has(node.text)) {
        // Check if this identifier is being referenced (not declared)
        const parent = node.parent;
        if (parent && !ts.isVariableDeclaration(parent) &&
            !ts.isFunctionDeclaration(parent) &&
            !ts.isParameter(parent)) {
          usedVariables.add(node.text);
        }
      }
      ts.forEachChild(node, findUsed);
    };

    // Find all variables defined in the selection
    const findDefined = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        definedVariables.add(node.name.text);
      }
      if (ts.isFunctionDeclaration(node) && node.name) {
        definedVariables.add(node.name.text);
      }
      if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
        definedVariables.add(node.name.text);
      }
      ts.forEachChild(node, findDefined);
    };

    findUsed(tempSourceFile);
    findDefined(tempSourceFile);

    // Parameters are variables used but not defined in the selection
    usedVariables.forEach(varName => {
      if (!definedVariables.has(varName) && !this.isValidIdentifier(varName)) {
        return; // Skip invalid identifiers
      }
      if (!definedVariables.has(varName)) {
        parameters.push({
          name: varName,
          type: 'any' // Type inference would require full type checker analysis
        });
      }
    });

    // Analyze return type by checking for return statements
    let hasReturn = false;
    const checkReturn = (node: ts.Node) => {
      if (ts.isReturnStatement(node) && node.expression) {
        hasReturn = true;
      }
      ts.forEachChild(node, checkReturn);
    };
    checkReturn(tempSourceFile);

    return {
      parameters,
      returnType: hasReturn ? 'any' : 'void'
    };
  }

  private generateFunctionSignature(
    functionName: string,
    parameters: Array<{ name: string; type: string }>,
    returnType: string
  ): string {
    const paramString = parameters
      .map(param => `${param.name}: ${param.type}`)
      .join(', ');

    return `function ${functionName}(${paramString}): ${returnType}`;
  }

  private generateFunctionCall(
    functionName: string,
    parameters: Array<{ name: string; type: string }>
  ): string {
    const argString = parameters.map(param => param.name).join(', ');
    return `${functionName}(${argString})`;
  }
}