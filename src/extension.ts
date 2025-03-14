import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const provider = new WebVMPanel(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(WebVMPanel.viewType, provider, { webviewOptions: { retainContextWhenHidden: true } })
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('webvm.resetDevice', () => {
			provider.getWebviewView().webview.postMessage({ command: 'resetDevice' });
		})
	);

	vscode.window.registerTerminalProfileProvider('webvm.terminal', {
		provideTerminalProfile(
			token: vscode.CancellationToken
		): vscode.ProviderResult<vscode.TerminalProfile> {
			return (async () =>
				new vscode.TerminalProfile({
					name: "WebVM",
					pty: new WebVMTerminal(provider.getWebviewView())
				})
			)();
		}
	});

	context.subscriptions.push(
		vscode.commands.registerCommand("webvm.createTerminal", async function () {
			const terminal = vscode.window.createTerminal({
				name: "WebVM",
				pty: new WebVMTerminal(provider.getWebviewView())
			});
			terminal.show();
		})
	);
}

class WebVMTerminal implements vscode.Pseudoterminal {
	public _view: vscode.WebviewView;
	private readonly textDecoder = new TextDecoder();

	constructor(view: vscode.WebviewView) {
		this._view = view;
	}

	private readonly _writeEmitter = new vscode.EventEmitter<string>();
	private readonly _closeEmitter = new vscode.EventEmitter<number>();

	public get onDidWrite() {
		return this._writeEmitter.event;
	}
	
	public get onDidClose() {
		return this._closeEmitter.event;
	}

	open() {
		this._view.webview.postMessage({ command: 'createTerminal' });
		this._view.webview.onDidReceiveMessage(data => {
			switch (data.command) {
				case 'output':
					const msg = this.textDecoder.decode(data.data);
					this._writeEmitter.fire(msg.split('\n').join('\r\n'));
					return;
			}
		});
	}

	close() {
		this._view.webview.postMessage({ command: 'closeTerminal' });
		this._closeEmitter.fire(0);
	}

	handleInput(data: string): void {
		this._view.webview.postMessage({
			command: 'input',
			data: data,
		});
	}

	setDimensions(dimensions: vscode.TerminalDimensions): void {
		this._view?.webview.postMessage({
			command: 'setDimensions',
			data: dimensions,
		});
	}
}

class WebVMPanel implements vscode.WebviewViewProvider {
	getWebviewView(): vscode.WebviewView {
		return this._view!;
	}

	public static readonly viewType = 'webvm.monitor';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		return `<!doctype html>
<html lang="en" style="height: 100%;">

<head>
  <meta charset="utf-8" />
  <meta name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, interactive-widget=resizes-content">
  <title>CheerpX Demo</title>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/lib/addon-web-links.min.js"></script>
  <link href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css" rel="stylesheet">
  
  <script src="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'))}"></script>
  <link href="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'))}" rel="stylesheet">

  <script src="https://cxrtnc.leaningtech.com/1.0.9/cx.js"></script>
</head>

<body>
  <div id="monitor"></div>
</body>

</html>`;
	}
}