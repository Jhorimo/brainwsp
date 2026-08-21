'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { API_URL } from '@/lib/api';

type Lang = 'curl' | 'php' | 'node' | 'python' | 'java' | 'csharp' | 'ruby' | 'go';
const LANGS: Array<{ id: Lang; label: string }> = [
  { id: 'curl', label: 'cURL' },
  { id: 'php', label: 'PHP' },
  { id: 'node', label: 'Node.js' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'csharp', label: 'C#' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'go', label: 'Go' },
];

function textMessageSnippet(lang: Lang, appKey: string) {
  const url = `${API_URL}/create-message`;
  switch (lang) {
    case 'curl':
      return `curl --location '${url}' \\\n--form 'appkey="${appKey}"' \\\n--form 'authkey="TU_AUTH_KEY"' \\\n--form 'to="51987654321"' \\\n--form 'message="Hola, este es un mensaje de prueba"'`;
    case 'php':
      return `$curl = curl_init();\n\ncurl_setopt_array($curl, array(\n  CURLOPT_URL => '${url}',\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_ENCODING => '',\n  CURLOPT_MAXREDIRS => 10,\n  CURLOPT_TIMEOUT => 0,\n  CURLOPT_FOLLOWLOCATION => true,\n  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,\n  CURLOPT_CUSTOMREQUEST => 'POST',\n  CURLOPT_POSTFIELDS => array(\n    'appkey' => '${appKey}',\n    'authkey' => 'TU_AUTH_KEY',\n    'to' => '51987654321',\n    'message' => 'Hola, este es un mensaje de prueba'\n  ),\n));\n\n$response = curl_exec($curl);\ncurl_close($curl);\necho $response;`;
    case 'node':
      return `const form = new FormData();\nform.append('appkey', '${appKey}');\nform.append('authkey', 'TU_AUTH_KEY');\nform.append('to', '51987654321');\nform.append('message', 'Hola, este es un mensaje de prueba');\n\nconst response = await fetch('${url}', { method: 'POST', body: form });\nconsole.log(await response.json());`;
    case 'python':
      return `import requests\n\nurl = "${url}"\npayload = {\n    'appkey': '${appKey}',\n    'authkey': 'TU_AUTH_KEY',\n    'to': '51987654321',\n    'message': 'Hola, este es un mensaje de prueba',\n}\n\nresponse = requests.post(url, data=payload)\nprint(response.json())`;
    case 'java':
      return `import java.net.URI;\nimport java.net.URLEncoder;\nimport java.net.http.*;\nimport java.nio.charset.StandardCharsets;\n\nHttpClient client = HttpClient.newHttpClient();\nString body = "appkey=${appKey}"\n    + "&authkey=TU_AUTH_KEY"\n    + "&to=51987654321"\n    + "&message=" + URLEncoder.encode("Hola, este es un mensaje de prueba", StandardCharsets.UTF_8);\n\nHttpRequest request = HttpRequest.newBuilder()\n    .uri(URI.create("${url}"))\n    .header("Content-Type", "application/x-www-form-urlencoded")\n    .POST(HttpRequest.BodyPublishers.ofString(body))\n    .build();\n\nHttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());\nSystem.out.println(response.body());`;
    case 'csharp':
      return `using var client = new HttpClient();\nvar payload = new Dictionary<string, string>\n{\n    { "appkey", "${appKey}" },\n    { "authkey", "TU_AUTH_KEY" },\n    { "to", "51987654321" },\n    { "message", "Hola, este es un mensaje de prueba" },\n};\n\nvar response = await client.PostAsync("${url}", new FormUrlEncodedContent(payload));\nConsole.WriteLine(await response.Content.ReadAsStringAsync());`;
    case 'ruby':
      return `require 'net/http'\nrequire 'uri'\n\nuri = URI("${url}")\nresponse = Net::HTTP.post_form(uri, {\n  'appkey' => '${appKey}',\n  'authkey' => 'TU_AUTH_KEY',\n  'to' => '51987654321',\n  'message' => 'Hola, este es un mensaje de prueba'\n})\n\nputs response.body`;
    case 'go':
      return `package main\n\nimport (\n\t"fmt"\n\t"io"\n\t"net/http"\n\t"net/url"\n)\n\nfunc main() {\n\tdata := url.Values{}\n\tdata.Set("appkey", "${appKey}")\n\tdata.Set("authkey", "TU_AUTH_KEY")\n\tdata.Set("to", "51987654321")\n\tdata.Set("message", "Hola, este es un mensaje de prueba")\n\n\tresp, err := http.PostForm("${url}", data)\n\tif err != nil {\n\t\tpanic(err)\n\t}\n\tdefer resp.Body.Close()\n\tbody, _ := io.ReadAll(resp.Body)\n\tfmt.Println(string(body))\n}`;
  }
}

function documentSnippet(lang: Lang, appKey: string) {
  const url = `${API_URL}/v1/messages/document`;
  switch (lang) {
    case 'curl':
      return `curl --location '${url}' \\\n--header 'Content-Type: application/json' \\\n--header 'X-App-Key: ${appKey}' \\\n--header 'X-Auth-Key: TU_AUTH_KEY' \\\n--data '{\n  "to": "51987654321",\n  "url": "https://erp.example.com/documentos/F001-00001234.pdf",\n  "fileName": "F001-00001234.pdf",\n  "caption": "Adjuntamos su comprobante electrónico."\n}'`;
    case 'php':
      return `$curl = curl_init();\n\ncurl_setopt_array($curl, array(\n  CURLOPT_URL => '${url}',\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_CUSTOMREQUEST => 'POST',\n  CURLOPT_HTTPHEADER => array(\n    'Content-Type: application/json',\n    'X-App-Key: ${appKey}',\n    'X-Auth-Key: TU_AUTH_KEY',\n  ),\n  CURLOPT_POSTFIELDS => json_encode(array(\n    'to' => '51987654321',\n    'url' => 'https://erp.example.com/documentos/F001-00001234.pdf',\n    'fileName' => 'F001-00001234.pdf',\n    'caption' => 'Adjuntamos su comprobante electrónico.',\n  )),\n));\n\n$response = curl_exec($curl);\ncurl_close($curl);\necho $response;`;
    case 'node':
      return `const response = await fetch('${url}', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json',\n    'X-App-Key': '${appKey}',\n    'X-Auth-Key': 'TU_AUTH_KEY',\n  },\n  body: JSON.stringify({\n    to: '51987654321',\n    url: 'https://erp.example.com/documentos/F001-00001234.pdf',\n    fileName: 'F001-00001234.pdf',\n    caption: 'Adjuntamos su comprobante electrónico.',\n  }),\n});\nconsole.log(await response.json());`;
    case 'python':
      return `import requests\n\nurl = "${url}"\nheaders = {\n    'X-App-Key': '${appKey}',\n    'X-Auth-Key': 'TU_AUTH_KEY',\n}\npayload = {\n    'to': '51987654321',\n    'url': 'https://erp.example.com/documentos/F001-00001234.pdf',\n    'fileName': 'F001-00001234.pdf',\n    'caption': 'Adjuntamos su comprobante electrónico.',\n}\n\nresponse = requests.post(url, json=payload, headers=headers)\nprint(response.json())`;
    case 'java':
      return `import java.net.URI;\nimport java.net.http.*;\n\nString json = """\n    {\n      "to": "51987654321",\n      "url": "https://erp.example.com/documentos/F001-00001234.pdf",\n      "fileName": "F001-00001234.pdf",\n      "caption": "Adjuntamos su comprobante electrónico."\n    }""";\n\nHttpClient client = HttpClient.newHttpClient();\nHttpRequest request = HttpRequest.newBuilder()\n    .uri(URI.create("${url}"))\n    .header("Content-Type", "application/json")\n    .header("X-App-Key", "${appKey}")\n    .header("X-Auth-Key", "TU_AUTH_KEY")\n    .POST(HttpRequest.BodyPublishers.ofString(json))\n    .build();\n\nHttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());\nSystem.out.println(response.body());`;
    case 'csharp':
      return `using System.Net.Http.Json;\n\nusing var client = new HttpClient();\nclient.DefaultRequestHeaders.Add("X-App-Key", "${appKey}");\nclient.DefaultRequestHeaders.Add("X-Auth-Key", "TU_AUTH_KEY");\n\nvar payload = new {\n    to = "51987654321",\n    url = "https://erp.example.com/documentos/F001-00001234.pdf",\n    fileName = "F001-00001234.pdf",\n    caption = "Adjuntamos su comprobante electrónico."\n};\n\nvar response = await client.PostAsJsonAsync("${url}", payload);\nConsole.WriteLine(await response.Content.ReadAsStringAsync());`;
    case 'ruby':
      return `require 'net/http'\nrequire 'uri'\nrequire 'json'\n\nuri = URI("${url}")\nhttp = Net::HTTP.new(uri.host, uri.port)\nhttp.use_ssl = uri.scheme == 'https'\n\nrequest = Net::HTTP::Post.new(uri)\nrequest['Content-Type'] = 'application/json'\nrequest['X-App-Key'] = '${appKey}'\nrequest['X-Auth-Key'] = 'TU_AUTH_KEY'\nrequest.body = {\n  to: '51987654321',\n  url: 'https://erp.example.com/documentos/F001-00001234.pdf',\n  fileName: 'F001-00001234.pdf',\n  caption: 'Adjuntamos su comprobante electrónico.'\n}.to_json\n\nresponse = http.request(request)\nputs response.body`;
    case 'go':
      return `package main\n\nimport (\n\t"bytes"\n\t"encoding/json"\n\t"fmt"\n\t"io"\n\t"net/http"\n)\n\nfunc main() {\n\tpayload, _ := json.Marshal(map[string]string{\n\t\t"to":       "51987654321",\n\t\t"url":      "https://erp.example.com/documentos/F001-00001234.pdf",\n\t\t"fileName": "F001-00001234.pdf",\n\t\t"caption":  "Adjuntamos su comprobante electrónico.",\n\t})\n\n\treq, _ := http.NewRequest("POST", "${url}", bytes.NewBuffer(payload))\n\treq.Header.Set("Content-Type", "application/json")\n\treq.Header.Set("X-App-Key", "${appKey}")\n\treq.Header.Set("X-Auth-Key", "TU_AUTH_KEY")\n\n\tresp, err := http.DefaultClient.Do(req)\n\tif err != nil {\n\t\tpanic(err)\n\t}\n\tdefer resp.Body.Close()\n\tbody, _ := io.ReadAll(resp.Body)\n\tfmt.Println(string(body))\n}`;
  }
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="code-block">
      <button className="code-copy" onClick={onCopy} title="Copiar código">{copied ? <Check size={13} /> : <Copy size={13} />}</button>
      <pre><code>{code}</code></pre>
    </div>
  );
}

export function ApiDocs({ appKey }: { appKey?: string }) {
  const [lang, setLang] = useState<Lang>('curl');
  const key = appKey || 'TU_APP_KEY';

  return (
    <section className="card" style={{ marginTop: 18 }}>
      <div className="card-header">
        <div><h2>Documentación para desarrolladores</h2><p>Ejemplos listos para copiar — reemplaza TU_AUTH_KEY por el AUTH KEY que guardaste al crear la credencial.</p></div>
      </div>
      <div className="card-body">
        <div className="lang-tabs">
          {LANGS.map((item) => <button key={item.id} className={`lang-tab ${lang === item.id ? 'active' : ''}`} onClick={() => setLang(item.id)}>{item.label}</button>)}
        </div>

        <h4 className="doc-subtitle">Enviar mensaje de texto</h4>
        <p className="doc-desc"><code>POST {API_URL}/create-message</code> — compatible con tus sistemas existentes, acepta form-data.</p>
        <CodeBlock code={textMessageSnippet(lang, key)} />

        <h4 className="doc-subtitle">Enviar documento (por URL)</h4>
        <p className="doc-desc"><code>POST {API_URL}/v1/messages/document</code> — el archivo debe estar accesible en una URL pública; BrainWSP lo descarga y lo envía.</p>
        <CodeBlock code={documentSnippet(lang, key)} />

        <h4 className="doc-subtitle">Respuesta exitosa</h4>
        <CodeBlock code={`{\n  "success": true,\n  "message_id": "6f1c2e2a-...-e2b1",\n  "status": "queued",\n  "instance": "principal"\n}`} />

        <h4 className="doc-subtitle">Parámetros</h4>
        <div className="params-table">
          <div className="params-row params-head"><span>Campo</span><span>Requerido</span><span>Descripción</span></div>
          <div className="params-row"><code>appkey</code><span>Sí</span><span>También se acepta como header <code>X-App-Key</code></span></div>
          <div className="params-row"><code>authkey</code><span>Sí</span><span>También se acepta como header <code>X-Auth-Key</code></span></div>
          <div className="params-row"><code>to</code><span>Sí</span><span>Número de destino con código de país, sin signos (ej. 51987654321)</span></div>
          <div className="params-row"><code>message</code><span>Solo texto</span><span>Contenido del mensaje</span></div>
          <div className="params-row"><code>url / fileName</code><span>Solo documento</span><span>URL pública del archivo y nombre a mostrar</span></div>
          <div className="params-row"><code>instance</code><span>No</span><span>Slug de la instancia; opcional si la credencial ya está fijada a una</span></div>
        </div>
      </div>
    </section>
  );
}
