import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { load } from "js-yaml";
import getPalette from "tailwindcss-palette-generator";
import { get } from 'lodash';

let previewPanel: vscode.WebviewPanel | undefined;
let currentDocument: vscode.TextDocument | undefined;
let configWatcher: vscode.FileSystemWatcher | undefined;

export function activate(context: vscode.ExtensionContext) {
    let previewDisposable = vscode.commands.registerCommand('chai-ui-blocks-builder.previewBlocks', previewChaiBlocks);

    context.subscriptions.push(previewDisposable);

    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.languageId === 'html') {
            currentDocument = editor.document;
            updatePreview();
        }
    });

    vscode.workspace.onDidChangeTextDocument(event => {
        if (currentDocument && event.document.uri === currentDocument.uri) {
            updatePreview();
        }
    });

    // Watch for changes in chai.config.json
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const configPath = path.join(workspaceFolders[0].uri.fsPath, 'chai.config.json');
        configWatcher = vscode.workspace.createFileSystemWatcher(configPath);

        configWatcher.onDidChange(() => {
            vscode.window.showInformationMessage('chai.config.json has changed. Updating preview...');
            updatePreview();
        });

        configWatcher.onDidCreate(() => {
            vscode.window.showInformationMessage('chai.config.json has been created. Updating preview...');
            updatePreview();
        });

        configWatcher.onDidDelete(() => {
            vscode.window.showInformationMessage('chai.config.json has been deleted. Reverting to default configuration...');
            updatePreview();
        });

        context.subscriptions.push(configWatcher);
    }
}

function previewChaiBlocks() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        currentDocument = editor.document;
        if (previewPanel) {
            previewPanel.reveal(vscode.ViewColumn.Beside);
        } else {
            previewPanel = vscode.window.createWebviewPanel(
                'chaiBlocksPreview',
                'Chai Blocks Preview',
                vscode.ViewColumn.Beside,
                { enableScripts: true }
            );

            previewPanel.onDidDispose(() => {
                previewPanel = undefined;
            });
        }

        updatePreview();
    }
}


const getConfig = (): any => {
    let config = {
        bodyFont: "Lato",
        headingFont: "Montserrat",
        roundedCorners: 8,
        primaryColor: "#942192",
        secondaryColor: "#f002b8",
        bodyBgDarkColor: "#031022",
        bodyBgLightColor: "#fcfcfc",
        bodyTextDarkColor: "#ffffff",
        bodyTextLightColor: "#000000"
    };

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const configPath = path.join(workspaceFolders[0].uri.fsPath, 'chai.config.json');
        if (fs.existsSync(configPath)) {
            try {
                const fileContent = fs.readFileSync(configPath, 'utf8');
                const fileConfig = JSON.parse(fileContent);
                config = { ...config, ...fileConfig };
            } catch (error) {
                console.error('Error reading chai.config.json:', error);
            }
        }
    }
    return config;
}

const getTailwindConfig = (): string => {
    const config = getConfig();
    const palette = getPalette([
        { color: config.primaryColor, name: "primary" },
        { color: config.secondaryColor, name: "secondary" },
    ]);

    const colors: Record<string, string> = {
        "bg-light": config.bodyBgLightColor,
        "bg-dark": config.bodyBgDarkColor,
        "text-dark": config.bodyTextDarkColor,
        "text-light": config.bodyTextLightColor,
    };

    return JSON.stringify({
        extend: {
            container: {
                center: true,
                padding: "1rem",
                screens: {
                    "2xl": "1300px",
                },
            },
            fontFamily: { heading: [config.headingFont], body: [config.bodyFont] },
            borderRadius: { DEFAULT: `${config.roundedCorners}px` },
            colors: { ...palette, ...colors },
        },
    });
};

const getFonts = (options: any) => {
  const headingFont = options.headingFont;
  const bodyFont = options.bodyFont;
  if (headingFont === bodyFont)
    return `<link href="https://fonts.googleapis.com/css2?family=${headingFont.replace(" ", "+")}:wght@400;500;600;700&display=swap" rel="stylesheet">`;

  return `
    <link href="https://fonts.googleapis.com/css2?family=${headingFont.replace(" ", "+")}:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=${bodyFont.replace(" ", "+")}:wght@400;500;600;700&display=swap" rel="stylesheet">
  `;
};

const extractJSONObject = (htmlContent:string) => {
  const blockMeta = htmlContent.match(/---([\s\S]*?)---/);
  if (blockMeta) {
    try {
      return load(blockMeta[1]);
    } catch (er) {}
  }
  return {};
};


function updatePreview() {
    if (previewPanel && currentDocument && currentDocument.languageId === 'html') {
        const content = currentDocument.getText();
        const metaData = extractJSONObject(content);    
		const html = content.replace(/---([\s\S]*?)---/g, "");
        const wrapperClasses = get(metaData, "previewWrapperClasses", "");
        const wrappedContent = `
			<!DOCTYPE html>
			<html lang="en" class="smooth-scroll" x-data="{darkMode: $persist(false)}" :class="{'dark': darkMode === true }">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                ${getFonts(getConfig())}
				<script src="https://cdn.tailwindcss.com?plugins=forms,aspect-ratio,typography"></script>
                <script>
                    tailwind.config = {
                        darkMode: 'class',
                        theme: ${getTailwindConfig()}, 
                        plugins: [
                             tailwind.plugin.withOptions(() =>
                                function ({ addBase, theme }) {
                                    addBase({
                                    "h1,h2,h3,h4,h5,h6": {
                                        fontFamily: theme("fontFamily.heading"),
                                    },
                                    body: {
                                        fontFamily: theme("fontFamily.body"),
                                        color: theme("colors.text-light"),
                                        backgroundColor: theme("colors.bg-light"),
                                    },
                                    ".dark body": {
                                        color: theme("colors.text-dark"),
                                        backgroundColor: theme("colors.bg-dark"),
                                    },
                                    });
                                }
                            )
                        ],
                    }
                </script>
				<title>${path.basename(currentDocument.fileName)}</title>
			</head>
			<body class="antialiased !p-0">
                <div class="flex items-center gap-x-2 p-2 bg-black border-b border-gray-400 dark:border-gray-700">
                    <button  @click="darkMode=!darkMode" type="button" class="inline-flex items-center gap-x-2 py-2 px-3 bg-white/10 rounded-full text-sm text-white hover:bg-white/20 focus:outline-none focus:bg-white/20" data-hs-theme-click-value="dark">
                        <svg x-show="!darkMode" class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
                        </svg>
                        <svg x-show="darkMode" class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="4"></circle>
                            <path d="M12 2v2"></path>
                            <path d="M12 20v2"></path>
                            <path d="m4.93 4.93 1.41 1.41"></path>
                            <path d="m17.66 17.66 1.41 1.41"></path>
                            <path d="M2 12h2"></path>
                            <path d="M20 12h2"></path>
                            <path d="m6.34 17.66-1.41 1.41"></path>
                            <path d="m19.07 4.93-1.41 1.41"></path>
                        </svg>
                        <span x-html="darkMode ? 'Switch to light mode' : 'Switch to dark mode'"></span>
                    </button>
                </div>
                <div class="${wrapperClasses}">
                    ${html}
                </div>
                <!-- Alpine Plugins -->
                <script defer src="https://cdn.jsdelivr.net/npm/@alpinejs/persist@3.x.x/dist/cdn.min.js"></script>
                <script src="https:///unpkg.com/alpinejs" defer></script>
                </body>
			</html>`;

        previewPanel.webview.html = wrappedContent;
    }
}

export function deactivate() {}