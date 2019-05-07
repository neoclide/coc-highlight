import { ExtensionContext, Uri, LanguageClient, ServerOptions, workspace, services, TransportKind, LanguageClientOptions } from 'coc.nvim'
import { RequestType, NotificationType } from 'vscode-languageserver-protocol'

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
  const file = context.asAbsolutePath('./lib/server/index.js')

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
    documentSelector: [{ scheme: '*' }],
    synchronize: {
      configurationSection: 'highlight'
    },
    outputChannelName: 'highlight'
  }

  let client = new LanguageClient('highlight', 'highlight server', serverOptions, clientOptions)

  workspace.documents.forEach(async doc => {
    let { buffer, uri } = doc
    let iskeyword = await buffer.getOption('iskeyword') as string
    keywordsMap[uri] = iskeyword
  })

  client.onReady().then(() => {

    client.onRequest(FetchKeywordRequest.type, uri => {
      return keywordsMap[uri] || '@,48-57,_'
    })

    client.onNotification(exitCalled, ([code, stack]): void => {
      if (code != 0) {
        workspace.showMessage(`highlight server exited with ${code}`)
      }
      if (stack) {
        // tslint:disable-next-line:no-console
        console.error(stack)
      }
    })

    workspace.onDidOpenTextDocument(async document => {
      let doc = workspace.getDocument(document.uri)
      if (!doc) return
      let { scheme } = Uri.parse(doc.uri)
      if (['quickfix', 'term', 'nofile'].indexOf(scheme) != -1) return
      let { bufnr } = doc
      let loaded = await workspace.nvim.call('bufloaded', bufnr) as number
      if (loaded != 1) return
      let iskeyword = await doc.buffer.getOption('iskeyword') as string
      keywordsMap[doc.uri] = iskeyword
    }, null, subscriptions)
  }, e => {
    // tslint:disable-next-line:no-console
    console.error(`highlight server start failed: ${e.message}`)
  })

  subscriptions.push(services.registLanguageClient(client))
}
