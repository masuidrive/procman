# Development Notes

## ESLint `any` Type Usage Guidelines

### When to Disable `@typescript-eslint/no-explicit-any`

Use `// eslint-disable-next-line @typescript-eslint/no-explicit-any` for these cases:

1. **External API Compatibility** - Node.js APIs, third-party libraries that require `any`
2. **Runtime Dynamic Data** - Unknown data structure until runtime (IPC payloads, JSON.parse, error objects)
3. **Type System Limitations** - TypeScript can't express the actual behavior adequately
4. **Performance-Critical Paths** - Type checking would hurt performance in hot paths

### Quick Check

Ask yourself: 
- Is this forced by external API? ✅ 
- Is the type unknown until runtime? ✅
- Would `unknown`/`object`/union work instead? ❌

If yes to first two and no to last → `any` with disable is OK.

### When NOT to Disable

**Do NOT disable the ESLint warning** in these cases:

#### 1. Function Return Types
```typescript
// ❌ WRONG - Use proper return type
function getData(): any {
  return { id: 1, name: 'test' };
}

// ✅ CORRECT - Use proper interface
interface DataResult {
  id: number;
  name: string;
}
function getData(): DataResult {
  return { id: 1, name: 'test' };
}
```

#### 2. Function Parameters (except EventEmitter cases)
```typescript
// ❌ WRONG - Use proper parameter type
function processData(data: any): void {
  console.log(data.id);
}

// ✅ CORRECT - Use proper interface
interface ProcessableData {
  id: number;
}
function processData(data: ProcessableData): void {
  console.log(data.id);
}
```

#### 3. Variable Declarations
```typescript
// ❌ WRONG - Use proper type
let config: any = loadConfig();

// ✅ CORRECT - Use proper interface
interface Config {
  port: number;
  host: string;
}
let config: Config = loadConfig();
```

#### 4. Object Properties
```typescript
// ❌ WRONG - Use proper property types
interface User {
  id: number;
  metadata: any;  // Don't do this
}

// ✅ CORRECT - Use specific types or Record
interface User {
  id: number;
  metadata: Record<string, unknown>;
}
```

### Code Review Checklist

When reviewing code with ESLint disable comments:

1. **Verify the use case**: Does it match one of the approved patterns above?
2. **Check alternatives**: Could a proper TypeScript interface be used instead?
3. **Assess scope**: Is the disable comment as narrow as possible (single line vs. entire function)?
4. **Documentation**: Is the reason for the disable clear from context?

### Adding New Disable Comments

When adding new `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments:

1. **Place on the line immediately before** the `any` usage
2. **Use single-line disable** rather than block disables when possible
3. **Consider adding a brief comment** if the reason isn't obvious from context
4. **Test thoroughly** to ensure type safety isn't compromised

### Examples

#### Good: EventEmitter with disable comment
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
on(event: string | symbol, listener: (...args: any[]) => void): this {
  this.eventEmitter.on(event, listener);
  return this;
}
```

#### Good: Type guard with disable comment
```typescript
// Validate unknown message structure
if (
  typeof obj === 'object' &&
  obj !== null &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (obj as any).id === 'string'
) {
  // Now we know obj has an id property of type string
}
```

#### Bad: Lazy typing
```typescript
// ❌ This should use a proper interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processUser(user: any): void {
  console.log(user.name);
}
```

### Project-Specific Context

This project uses EventEmitter patterns extensively for IPC communication, which naturally requires `any` types for event argument flexibility. The disable comments help maintain clean builds while preserving type safety where it matters most.

### Maintenance

- Review and update this document when new patterns emerge
- Audit disable comments during major refactoring efforts
- Consider removing disable comments when TypeScript improves type inference