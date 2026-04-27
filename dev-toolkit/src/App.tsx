import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  buildTsFromJson,
  createBcryptHash,
  decodeBase64Unicode,
  decryptAesText,
  decodeJwt,
  encryptAesText,
  encodeBase64Unicode,
  formatSql,
  hashText,
  obfuscateJavaScript,
  verifyBcryptHash,
} from "./lib/dev-tools";

type ToolId = "json-ts" | "jwt" | "base64" | "hash" | "aes" | "bcrypt" | "obfuscate" | "sql";
type HashAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

type Tool = {
  id: ToolId;
  label: string;
  blurb: string;
};

const TOOLS: Tool[] = [
  { id: "json-ts", label: "JSON -> TS", blurb: "JSON örneğinden tip çıkar." },
  { id: "jwt", label: "JWT", blurb: "Header ve payload'ı yerelde çöz." },
  { id: "base64", label: "Base64", blurb: "Encode ve decode et." },
  { id: "hash", label: "Hash", blurb: "SHA digest üret." },
  { id: "aes", label: "AES", blurb: "Şifreyle encrypt / decrypt et." },
  { id: "bcrypt", label: "Bcrypt", blurb: "Hash üret ve doğrula." },
  { id: "obfuscate", label: "Obfuscate", blurb: "JavaScript kodunu karmaşıklaştır." },
  { id: "sql", label: "SQL", blurb: "Sorguyu okunur biçimde düzenle." },
];

const DEFAULT_JSON = `{
  "id": 42,
  "title": "Miniapps",
  "published": true,
  "tags": ["local", "tooling"],
  "author": {
    "name": "Yusuf",
    "city": "Istanbul"
  }
}`;

const DEFAULT_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Ill1c3VmIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const DEFAULT_BASE64_TEXT = "Merhaba miniapps";
const DEFAULT_HASH_TEXT = "Local-first tooling";
const DEFAULT_AES_TEXT = "Bu metin yerelde AES-GCM ile şifrelenir.";
const DEFAULT_AES_PASSPHRASE = "miniapps-secret";
const DEFAULT_BCRYPT_TEXT = "Parola123!";
const DEFAULT_OBFUSCATE_INPUT = `function greet(name) {
  const message = "Merhaba " + name;
  console.log(message);
}

greet("miniapps");`;
const DEFAULT_SQL = `select u.id, u.name, c.name as company_name from users u left join companies c on c.id = u.company_id where u.is_active = 1 and c.country = 'TR' order by u.created_at desc limit 20;`;

function PanelFrame(props: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="panel-frame">
      <div className="panel-copy">
        <h2>{props.title}</h2>
        <p>{props.description}</p>
      </div>
      {props.children}
    </section>
  );
}

const isDistribution = window.location.hostname === "miniapps.tr";

export default function App() {
  const logoUrl = `${import.meta.env.BASE_URL}assets/dev-toolkit-logo.svg`;
  const [activeTool, setActiveTool] = useState<ToolId>("json-ts");
  const [toast, setToast] = useState("");

  const [jsonInput, setJsonInput] = useState(DEFAULT_JSON);
  const [typeName, setTypeName] = useState("ApiResponse");
  const [jwtInput, setJwtInput] = useState(DEFAULT_JWT);
  const [base64Plain, setBase64Plain] = useState(DEFAULT_BASE64_TEXT);
  const [base64Encoded, setBase64Encoded] = useState(() => encodeBase64Unicode(DEFAULT_BASE64_TEXT));
  const [base64Error, setBase64Error] = useState<string | null>(null);

  const [hashInput, setHashInput] = useState(DEFAULT_HASH_TEXT);
  const [hashAlgorithm, setHashAlgorithm] = useState<HashAlgorithm>("SHA-256");
  const [hashHex, setHashHex] = useState("");
  const [hashBase64, setHashBase64] = useState("");

  const [aesPlainText, setAesPlainText] = useState(DEFAULT_AES_TEXT);
  const [aesPassphrase, setAesPassphrase] = useState(DEFAULT_AES_PASSPHRASE);
  const [aesPayload, setAesPayload] = useState("");
  const [aesError, setAesError] = useState<string | null>(null);

  const [bcryptInput, setBcryptInput] = useState(DEFAULT_BCRYPT_TEXT);
  const [bcryptRounds, setBcryptRounds] = useState(10);
  const [bcryptDigest, setBcryptDigest] = useState("");
  const [bcryptVerifyInput, setBcryptVerifyInput] = useState(DEFAULT_BCRYPT_TEXT);
  const [bcryptVerifyResult, setBcryptVerifyResult] = useState<string | null>(null);

  const [obfuscateInput, setObfuscateInput] = useState(DEFAULT_OBFUSCATE_INPUT);
  const [obfuscateOutput, setObfuscateOutput] = useState("");
  const [obfuscateError, setObfuscateError] = useState<string | null>(null);

  const [sqlInput, setSqlInput] = useState(DEFAULT_SQL);

  const jsonState = useMemo(() => {
    try {
      return buildTsFromJson(jsonInput, typeName);
    } catch (error) {
      const message = error instanceof Error ? error.message : "JSON çözümlenemedi.";
      return { output: "", error: message };
    }
  }, [jsonInput, typeName]);

  const jwtData = useMemo(() => decodeJwt(jwtInput), [jwtInput]);
  const sqlOutput = useMemo(() => formatSql(sqlInput), [sqlInput]);

  useEffect(() => {
    void hashText(hashInput, hashAlgorithm).then((result) => {
      setHashHex(result.hex);
      setHashBase64(result.base64);
    });
  }, [hashAlgorithm, hashInput]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function handleCopy(value: string, label: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setToast(`${label} panoya kopyalandı.`);
  }

  function handleEncodeBase64() {
    setBase64Error(null);
    setBase64Encoded(encodeBase64Unicode(base64Plain));
  }

  function handleDecodeBase64() {
    try {
      setBase64Error(null);
      setBase64Plain(decodeBase64Unicode(base64Encoded));
    } catch (error) {
      setBase64Error(error instanceof Error ? error.message : "Base64 çözümlenemedi.");
    }
  }

  async function handleEncryptAes() {
    try {
      setAesError(null);
      const payload = await encryptAesText(aesPlainText, aesPassphrase);
      setAesPayload(payload);
      setToast("AES payload hazır.");
    } catch (error) {
      setAesError(error instanceof Error ? error.message : "Şifreleme tamamlanamadı.");
    }
  }

  async function handleDecryptAes() {
    try {
      setAesError(null);
      const plainText = await decryptAesText(aesPayload, aesPassphrase);
      setAesPlainText(plainText);
      setToast("AES payload çözüldü.");
    } catch (error) {
      setAesError(error instanceof Error ? error.message : "AES payload çözülemedi.");
    }
  }

  async function handleCreateBcrypt() {
    const digest = await createBcryptHash(bcryptInput, bcryptRounds);
    setBcryptDigest(digest);
    setBcryptVerifyResult(null);
    setToast("Bcrypt hash hazır.");
  }

  async function handleVerifyBcrypt() {
    const isValid = await verifyBcryptHash(bcryptVerifyInput, bcryptDigest);
    setBcryptVerifyResult(isValid ? "Hash ile eşleşiyor." : "Hash ile eşleşmiyor.");
  }

  function handleObfuscate() {
    try {
      setObfuscateError(null);
      setObfuscateOutput(obfuscateJavaScript(obfuscateInput));
      setToast("Obfuscation tamamlandı.");
    } catch (error) {
      setObfuscateError(error instanceof Error ? error.message : "Kod karmaşıklaştırılamadı.");
    }
  }

  return (
    <main className="dev-shell">
      <header className="app-header">
        <img className="brand-logo" src={logoUrl} alt="Dev Toolkit" />
      </header>

      <section className="workspace-shell">
        <aside className="tool-sidebar">
          <div className="tool-sidebar-copy">
            <h2>Toolset</h2>
            <p>Metin, token, şema ve sorgu işlemlerini tek panelde topla.</p>
          </div>

          <div className="tool-list">
            {TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={`tool-tab${activeTool === tool.id ? " is-active" : ""}`}
                onClick={() => setActiveTool(tool.id)}
              >
                <strong>{tool.label}</strong>
                <span>{tool.blurb}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="tool-stage">
          {activeTool === "json-ts" ? (
            <PanelFrame title="JSON -> TypeScript" description="JSON örneğini parse edip kullanılabilir TS tiplerine çevirir.">
              <div className="field-row">
                <label className="field">
                  <span>Root type adı</span>
                  <input value={typeName} onChange={(event) => setTypeName(event.target.value)} />
                </label>
                <button type="button" className="ghost-button" onClick={() => void handleCopy(jsonState.output, "TypeScript çıktısı")}>
                  Çıktıyı Kopyala
                </button>
              </div>

              <div className="editor-grid">
                <label className="editor-panel">
                  <span>JSON input</span>
                  <textarea value={jsonInput} onChange={(event) => setJsonInput(event.target.value)} spellCheck={false} />
                </label>
                <label className="editor-panel">
                  <span>TypeScript output</span>
                  <textarea value={jsonState.error ?? jsonState.output} readOnly spellCheck={false} />
                </label>
              </div>
            </PanelFrame>
          ) : null}

          {activeTool === "jwt" ? (
            <PanelFrame title="JWT Decoder" description="Token imzasını doğrulamaz; header ve payload'ı tarayıcı içinde çözümler.">
              <label className="editor-panel">
                <span>JWT</span>
                <textarea value={jwtInput} onChange={(event) => setJwtInput(event.target.value)} spellCheck={false} />
              </label>

              {jwtData.error ? <p className="inline-note">{jwtData.error}</p> : null}

              <div className="chip-row">
                {jwtData.meta.map((item) => (
                  <span key={item} className="meta-chip">
                    {item}
                  </span>
                ))}
              </div>

              <div className="editor-grid">
                <label className="editor-panel">
                  <span>Header</span>
                  <textarea value={jwtData.header} readOnly spellCheck={false} />
                </label>
                <label className="editor-panel">
                  <span>Payload</span>
                  <textarea value={jwtData.payload} readOnly spellCheck={false} />
                </label>
              </div>

              <label className="editor-panel">
                <span>Signature</span>
                <textarea value={jwtData.signature} readOnly spellCheck={false} />
              </label>
            </PanelFrame>
          ) : null}

          {activeTool === "base64" ? (
            <PanelFrame title="Base64 Encoder / Decoder" description="Unicode destekli encode ve decode akışı.">
              <div className="action-row">
                <button type="button" className="ghost-button" onClick={handleEncodeBase64}>
                  Text to Base64
                </button>
                <button type="button" className="ghost-button" onClick={handleDecodeBase64}>
                  Base64 to Text
                </button>
                <button type="button" className="ghost-button" onClick={() => void handleCopy(base64Encoded, "Base64 çıktısı")}>
                  Base64 Kopyala
                </button>
              </div>

              {base64Error ? <p className="inline-note">{base64Error}</p> : null}

              <div className="editor-grid">
                <label className="editor-panel">
                  <span>Düz metin</span>
                  <textarea value={base64Plain} onChange={(event) => setBase64Plain(event.target.value)} spellCheck={false} />
                </label>
                <label className="editor-panel">
                  <span>Base64</span>
                  <textarea value={base64Encoded} onChange={(event) => setBase64Encoded(event.target.value)} spellCheck={false} />
                </label>
              </div>
            </PanelFrame>
          ) : null}

          {activeTool === "hash" ? (
            <PanelFrame title="Hash Generator" description="Web Crypto ile SHA tabanlı digest üretir.">
              <div className="field-row">
                <label className="field">
                  <span>Algoritma</span>
                  <select value={hashAlgorithm} onChange={(event) => setHashAlgorithm(event.target.value as HashAlgorithm)}>
                    <option value="SHA-1">SHA-1</option>
                    <option value="SHA-256">SHA-256</option>
                    <option value="SHA-384">SHA-384</option>
                    <option value="SHA-512">SHA-512</option>
                  </select>
                </label>
                <button type="button" className="ghost-button" onClick={() => void handleCopy(hashHex, "Hex digest")}>
                  Hex Kopyala
                </button>
              </div>

              <label className="editor-panel">
                <span>Input</span>
                <textarea value={hashInput} onChange={(event) => setHashInput(event.target.value)} spellCheck={false} />
              </label>

              <div className="editor-grid">
                <label className="editor-panel">
                  <span>Hex</span>
                  <textarea value={hashHex} readOnly spellCheck={false} />
                </label>
                <label className="editor-panel">
                  <span>Base64</span>
                  <textarea value={hashBase64} readOnly spellCheck={false} />
                </label>
              </div>
            </PanelFrame>
          ) : null}

          {activeTool === "aes" ? (
            <PanelFrame title="AES Encrypt / Decrypt" description="Passphrase tabanlı AES-GCM şifreleme ve çözme akışı.">
              <div className="field-row">
                <label className="field">
                  <span>Şifre</span>
                  <input value={aesPassphrase} onChange={(event) => setAesPassphrase(event.target.value)} />
                </label>
                <div className="action-row action-row-inline">
                  <button type="button" className="ghost-button" onClick={() => void handleEncryptAes()}>
                    Encrypt
                  </button>
                  <button type="button" className="ghost-button" onClick={() => void handleDecryptAes()}>
                    Decrypt
                  </button>
                  <button type="button" className="ghost-button" onClick={() => void handleCopy(aesPayload, "AES payload")}>
                    Payload Kopyala
                  </button>
                </div>
              </div>

              {aesError ? <p className="inline-note">{aesError}</p> : null}

              <div className="editor-grid">
                <label className="editor-panel">
                  <span>Düz metin</span>
                  <textarea value={aesPlainText} onChange={(event) => setAesPlainText(event.target.value)} spellCheck={false} />
                </label>
                <label className="editor-panel">
                  <span>Payload</span>
                  <textarea value={aesPayload} onChange={(event) => setAesPayload(event.target.value)} spellCheck={false} />
                </label>
              </div>
            </PanelFrame>
          ) : null}

          {activeTool === "bcrypt" ? (
            <PanelFrame title="Bcrypt Helper" description="Hash üretir ve mevcut hash ile düz metni doğrular.">
              <div className="field-row field-row-wide">
                <label className="field">
                  <span>Salt rounds</span>
                  <input
                    type="number"
                    min={4}
                    max={14}
                    value={bcryptRounds}
                    onChange={(event) => setBcryptRounds(Number(event.target.value))}
                  />
                </label>
                <div className="action-row action-row-inline">
                  <button type="button" className="ghost-button" onClick={() => void handleCreateBcrypt()}>
                    Hash Üret
                  </button>
                  <button type="button" className="ghost-button" onClick={() => void handleVerifyBcrypt()}>
                    Doğrula
                  </button>
                  <button type="button" className="ghost-button" onClick={() => void handleCopy(bcryptDigest, "Bcrypt hash")}>
                    Hash Kopyala
                  </button>
                </div>
              </div>

              {bcryptVerifyResult ? <p className="inline-note">{bcryptVerifyResult}</p> : null}

              <div className="editor-grid">
                <label className="editor-panel">
                  <span>Düz metin</span>
                  <textarea value={bcryptInput} onChange={(event) => setBcryptInput(event.target.value)} spellCheck={false} />
                </label>
                <label className="editor-panel">
                  <span>Bcrypt hash</span>
                  <textarea value={bcryptDigest} onChange={(event) => setBcryptDigest(event.target.value)} spellCheck={false} />
                </label>
              </div>

              <label className="editor-panel">
                <span>Doğrulama input</span>
                <textarea
                  value={bcryptVerifyInput}
                  onChange={(event) => setBcryptVerifyInput(event.target.value)}
                  spellCheck={false}
                />
              </label>
            </PanelFrame>
          ) : null}

          {activeTool === "obfuscate" ? (
            <PanelFrame title="JavaScript Obfuscator" description="Kaynak kodu yerelde karmaşıklaştırır; hızlı kopyalama için uygun çıktı üretir.">
              <div className="action-row action-row-inline">
                <button type="button" className="ghost-button" onClick={handleObfuscate}>
                  Obfuscate
                </button>
                <button type="button" className="ghost-button" onClick={() => void handleCopy(obfuscateOutput, "Obfuscated JS")}>
                  Çıktıyı Kopyala
                </button>
              </div>

              {obfuscateError ? <p className="inline-note">{obfuscateError}</p> : null}

              <div className="editor-grid">
                <label className="editor-panel">
                  <span>Kaynak JS</span>
                  <textarea value={obfuscateInput} onChange={(event) => setObfuscateInput(event.target.value)} spellCheck={false} />
                </label>
                <label className="editor-panel">
                  <span>Obfuscated output</span>
                  <textarea value={obfuscateOutput} readOnly spellCheck={false} />
                </label>
              </div>
            </PanelFrame>
          ) : null}

          {activeTool === "sql" ? (
            <PanelFrame title="SQL Formatter" description="Sorguyu hızlı okunur hale getiren hafif bir yerel formatter.">
              <div className="action-row">
                <button type="button" className="ghost-button" onClick={() => void handleCopy(sqlOutput, "SQL çıktısı")}>
                  SQL Kopyala
                </button>
              </div>

              <div className="editor-grid">
                <label className="editor-panel">
                  <span>SQL input</span>
                  <textarea value={sqlInput} onChange={(event) => setSqlInput(event.target.value)} spellCheck={false} />
                </label>
                <label className="editor-panel">
                  <span>Formatted output</span>
                  <textarea value={sqlOutput} readOnly spellCheck={false} />
                </label>
              </div>
            </PanelFrame>
          ) : null}
        </section>
      </section>

      {toast ? <div className="toast">{toast}</div> : null}
      {isDistribution && (
        <footer className="miniapps-footer">
          <a href="https://miniapps.tr" target="_blank" rel="noopener noreferrer" aria-label="miniapps.tr">
            <img
              src={`${import.meta.env.BASE_URL}assets/miniapps-logo-dark.svg`}
              alt="miniapps.tr"
              className="miniapps-footer-logo"
            />
          </a>
        </footer>
      )}
    </main>
  );
}
