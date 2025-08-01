# ./bin/ - 開発ツール置き場

procman プロジェクトの開発に必要なスクリプト群を格納しています。

## コマンド説明

### **test-unit.sh**: ユニットテストと静的解析の実行
- 役割: TypeScript型チェック、ESLint、Prettier、Vitestユニットテストを実行
- オプション: なし
- 起動サブプロセス: tsc, eslint, prettier, vitest
- 環境変数: なし

### **test-integration.sh**: 統合テストの実行
- 役割: procmanの実際のプロセス管理機能をテスト
- オプション: なし
- 起動サブプロセス: vitest (統合テスト用設定)
- 環境変数: TEST_ENV=integration

### **install-deps.sh**: プロジェクト依存関係の自動インストール
- 役割: package.jsonからnpm依存関係をインストール
- オプション: なし
- 起動サブプロセス: npm install
- 環境変数: なし

### **setup-claude-mcp.sh**: Claude Code MCP設定
- 役割: Claude CodeのMCP設定を行う
- オプション: なし
- 起動サブプロセス: claude mcp コマンド
- 環境変数: なし

### **claude.sh**: Claude Code実行ヘルパー
- 役割: claude コマンドを権限チェックをスキップして実行
- オプション: claude コマンドの全オプションをパススルー
- 起動サブプロセス: claude
- 環境変数: なし

### **ticket.sh**: チケット管理システム
- 役割: プロジェクトのタスク管理を行う
- オプション: list, create, close など（チケットシステム依存）
- 起動サブプロセス: git, エディタなど
- 環境変数:
  - EDITOR = "使用するエディタ（デフォルト: vim）"
  - TICKET_BRANCH_PREFIX = "feature/" など