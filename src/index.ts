import { ExtensionContext, LanguageClient, LanguageClientOptions, NotificationType, RequestType, ServerOptions, services, TransportKind, window, workspace } from 'coc.nvim';

namespace FetchKeywordRequest {
  export const type = new RequestType<
    string,
    string,
    void,
    void>('highlight/iskeyword')
}

const exitCalled = new NotificationType<[number, string], void>(
  'highlight/exitCalled'
)

const keywordsMap: { [uri: string]: string } = {}

export async function activate(context: ExtensionContext): Promise<void> {
  let { subscriptions } = context
  const config = workspace.getConfiguration('highlight')
  const file = context.asAbsolutePath('./lib/server.js')

  let serverOptions: ServerOptions = {
    module: file,
    args: ['--node-ipc'],
    transport: TransportKind.ipc,
    options: {
      cwd: workspace.root,
      execArgv: config.get<string[]>('execArgv', [])
    }
  }

  let clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: '*' }, { pattern: '*' }],
    synchronize: {
      configurationSection: 'highlight'
    },
    outputChannelName: 'highlight'
  }

  let client = new LanguageClient('highlight', 'highlight server', serverOptions, clientOptions)

  workspace.documents.forEach(async doc => {
    let { buffer, uri } = doc
    try {
      let iskeyword = await buffer.getOption('iskeyword') as string
      keywordsMap[uri] = iskeyword
    } catch (e) {
      // noop
    }
  })

  client.onReady().then(() => {

    client.onRequest(FetchKeywordRequest.type, uri => {
      return keywordsMap[uri] || '@,48-57,_'
    })

    client.onNotification(exitCalled, ([code, stack]): void => {
      if (code != 0) {
        window.showMessage(`highlight server exited with ${code}`)
      }
      if (stack) {
        // tslint:disable-next-line:no-console
        console.error(stack)
      }
    })

    workspace.onDidOpenTextDocument(async document => {
      let doc = workspace.getDocument(document.uri)
      if (!doc || doc.buftype != '') return
      let { bufnr } = doc
      let loaded = await workspace.nvim.call('bufloaded', bufnr) as number
      if (loaded != 1) return
      try {
        let iskeyword = await doc.buffer.getOption('iskeyword') as string
        keywordsMap[doc.uri] = iskeyword
      } catch (e) {
        // noop
      }
    }, null, subscriptions)
  }, e => {
    // tslint:disable-next-line:no-console
    console.error(`highlight server start failed: ${e.message}`)
  })
  client.start()
  subscriptions.push(services.registLanguageClient(client))
}
