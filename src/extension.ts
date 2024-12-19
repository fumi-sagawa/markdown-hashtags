// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { HashtagCompletionItemProvider } from "./completion";
import { HashtagReferenceProvider } from "./reference";
import { getTagTree, GetTagTreeReason } from "./parser";
import { HashtagTree, HashtagTreeItem } from "./tree";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // first hashtags parsing for workspace
  await getTagTree(GetTagTreeReason.forWorkspace);
  const hashtagTree = new HashtagTree();

  vscode.window.registerTreeDataProvider("hashtagTree", hashtagTree);
  vscode.workspace.onDidSaveTextDocument(async (e: vscode.TextDocument) => {
    await getTagTree(GetTagTreeReason.forFileCreatedOrUpdated, [e.uri.fsPath]);
    hashtagTree.refresh();
  });

  vscode.workspace.onDidChangeConfiguration(
    async (e: vscode.ConfigurationChangeEvent) => {
      await getTagTree(GetTagTreeReason.forWorkspace);
      hashtagTree.refresh();
    }
  );

  vscode.workspace.onDidDeleteFiles(async (e: vscode.FileDeleteEvent) => {
    await getTagTree(
      GetTagTreeReason.forFileDeleted,
      e.files.map((file) => {
        return file.fsPath;
      })
    );
    hashtagTree.refresh();
  });

  vscode.workspace.onDidRenameFiles(async (e: vscode.FileRenameEvent) => {
    await getTagTree(
      GetTagTreeReason.forFileRenamed,
      e.files.map((file) => {
        return file.newUri.fsPath;
      }),
      e.files.map((file) => {
        return file.oldUri.fsPath;
      })
    );
    hashtagTree.refresh();
  });

  vscode.workspace.onDidCreateFiles(async (e: vscode.FileCreateEvent) => {
    await getTagTree(
      GetTagTreeReason.forFileCreatedOrUpdated,
      e.files.map((file) => {
        return file.fsPath;
      })
    );
    hashtagTree.refresh();
  });

  // Register all commands and add them to subscriptions
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-hashtags.refreshTags",
      async () => {
        await getTagTree(GetTagTreeReason.forWorkspace);
        hashtagTree.refresh();
      }
    ),

    vscode.commands.registerCommand(
      "markdown-hashtags.setAscendingSort",
      () => {
        vscode.workspace
          .getConfiguration()
          .update("markdown-hashtags.sorting.order", "asc");
      }
    ),

    vscode.commands.registerCommand(
      "markdown-hashtags.setDescendingSort",
      () => {
        vscode.workspace
          .getConfiguration()
          .update("markdown-hashtags.sorting.order", "desc");
      }
    ),

    vscode.commands.registerCommand("markdown-hashtags.setSortByName", () => {
      vscode.workspace
        .getConfiguration()
        .update("markdown-hashtags.sorting.key", "name");
    }),

    vscode.commands.registerCommand(
      "markdown-hashtags.setSortByCountFiles",
      () => {
        vscode.workspace
          .getConfiguration()
          .update("markdown-hashtags.sorting.key", "countFiles");
      }
    ),

    vscode.commands.registerCommand(
      "markdown-hashtags.setSortByCountTags",
      () => {
        vscode.workspace
          .getConfiguration()
          .update("markdown-hashtags.sorting.key", "countTags");
      }
    ),

    vscode.commands.registerCommand(
      "markdown-hashtags.renameTag",
      async (item: HashtagTreeItem) => {
        if (!item) return;

        const newName = await vscode.window.showInputBox({
          prompt: "Enter new tag name (without #)",
          value: item.label,
          validateInput: (value) => {
            if (!value) return "Tag name cannot be empty";
            if (value.includes(" ")) return "Tag name cannot contain spaces";
            if (value.match(/[!@#$%^&*()=+,\[{\]};:'"?><]/))
              return "Tag name cannot contain special characters";
            return null;
          },
        });

        if (!newName || newName === item.label) return;

        // Get all files that contain this tag
        const tagTree = await getTagTree(GetTagTreeReason.justGet);
        const oldTagPath = item.parentTagsPath;
        const locations = item.files ?? [];

        // Update each file that contains the tag
        for (const location of locations) {
          const document = await vscode.workspace.openTextDocument(
            location.uri
          );
          const edit = new vscode.WorkspaceEdit();
          const line = document.lineAt(location.range.start.line);
          const lineText = line.text;

          // Create the old and new tag paths
          const oldTag = "#" + oldTagPath.join("/");
          const newTag = "#" + [...oldTagPath.slice(0, -1), newName].join("/");

          // Replace the old tag with the new tag
          const newLineText = lineText.replace(oldTag, newTag);
          if (newLineText !== lineText) {
            edit.replace(location.uri, line.range, newLineText);
            await vscode.workspace.applyEdit(edit);
            await document.save();
          }
        }

        // Refresh the tag tree
        await getTagTree(GetTagTreeReason.forWorkspace);
        hashtagTree.refresh();
      }
    ),

    vscode.languages.registerReferenceProvider(
      "markdown",
      new HashtagReferenceProvider()
    ),

    vscode.languages.registerCompletionItemProvider(
      "markdown",
      new HashtagCompletionItemProvider(),
      "#",
      "/"
    )
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
