// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    function InitXterm(id) {
        var term = new Terminal({ cursorBlink: true, convertEol: true, fontFamily: "monospace", fontWeight: 400, fontWeightBold: 700 });
        term.open(document.getElementById(id));
        const linkAddon = new WebLinksAddon.WebLinksAddon();
        term.loadAddon(linkAddon);
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);

        term.scrollToTop();
        fitAddon.fit();
        term.focus();

        window.addEventListener("resize", () => {
            fitAddon.fit();
        });

        return term;
    }

    window.onload = async () => {
        const monitor = InitXterm("monitor");
        monitor.write("WebVM is loading...\n");

        const imageUrl = "wss://disks.webvm.io/debian_large_20230522_5044875331.ext2";
        // The read-only disk image from Leaning Technologies' fast cloud backend
        const blockDevice = await CheerpX.CloudDevice.create(imageUrl).
            catch((error) => {
                monitor.write(`Failed to load the disk image from ${imageUrl}\n`);
            });

        if (!blockDevice) {
            return;
        }

        // Read-write local storage for disk blocks, it is used both as a cache and as persisteny writable storage
        const idbDevice = await CheerpX.IDBDevice.create("block1");
        // A device to overlay the local changes to the disk with the remote read-only image
        const overlayDevice = await CheerpX.OverlayDevice.create(
            blockDevice,
            idbDevice
        );
        // Direct acces to files in your HTTP server
        const webDevice = await CheerpX.WebDevice.create("");
        // Convenient access to JavaScript binary data and strings
        const dataDevice = await CheerpX.DataDevice.create();

        const cx = await CheerpX.Linux.create({
            mounts: [
                { type: "ext2", path: "/", dev: overlayDevice },
                { type: "dir", path: "/app", dev: webDevice },
                { type: "dir", path: "/data", dev: dataDevice },
                { type: "devs", path: "/dev" },
            ],
        });

        monitor.write("WebVM is ready.\n");

        let termIndex = 0;

        async function runShell() {
            const termId = `terminal${termIndex}`;
            const termContainer = document.createElement('div');
            termContainer.id = termId;
            termContainer.style.display = 'none';
            document.body.appendChild(termContainer);

            const input = cx.setCustomConsole(
                (buf) => {
                    vscode.postMessage({
                        command: 'output',
                        data: buf
                    });
                }
            );

            const cxActivateFunc = cx.setActivateConsole((idx) => {
                monitor.write(`setActivateConsole VT ${idx}\n`);
                activateVt(idx);
            });

            const activateVt = (idx) => {
                monitor.write(`Activate VT ${idx}\n`);
                // Perform any additional front-end logic
                // ...
                // Call the function returned by setActivateConsole to complete the activation
                cxActivateFunc(idx);
            };

            window.addEventListener('message', event => {
                const eventData = event.data; // The json data that the extension sent
                switch (eventData.command) {
                    case 'input':
                        for (let i = 0; i < eventData.data.length; i++) {
                            input(eventData.data.charCodeAt(i));
                        }
                        break;
                }
            });

            // Run a full-featured shell in your browser.
            await cx.run("/bin/bash", ["--login"], {
                env: [
                    "HOME=/home/user",
                    "USER=user",
                    "SHELL=/bin/bash",
                    "EDITOR=vim",
                    "LANG=en_US.UTF-8",
                    "LC_ALL=C",
                    "TERM=xterm-256color"
                ],
                cwd: "/home/user",
                uid: 1000,
                gid: 1000,
            });

            termIndex++;
        }

        function destroyTerm(index) {
            const termId = `terminal${index}`;
            const termContainer = document.getElementById(termId);
            if (termContainer) {
                termContainer.remove();
            }
        }

        // Handle messages sent from the extension to the webview
        window.addEventListener('message', async event => {
            const eventData = event.data; // The json data that the extension sent
            switch (eventData.command) {
                case 'createTerminal':
                    monitor.write('Create Terminal\n');
                    runShell();
                    break;
                case 'closeTerminal':
                    monitor.write('Close Terminal\n');
                    destroyTerm(termIndex - 1);
                    break;
                case 'setDimensions':
                    monitor.write(`Set Dimensions: ${JSON.stringify(eventData.data)}\n`);
                    break;
                case 'resetDevice':
                    monitor.write('Reset device\n');
                    await idbDevice.reset().then(() => {
                        monitor.write('Reset device done\n');
                    });
                    break;
            }
        });
    };
}());
