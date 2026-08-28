import {
  CheckCircle2,
  CircleAlert,
  Clipboard,
  ClipboardPaste,
  Gavel,
  KeyRound,
  LoaderCircle,
  Plug,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AttorneyProfile } from "../attorneys/types.ts";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { SourceForm } from "../components/SourceForm.tsx";
import type { Publication } from "../djen/types.ts";
import {
  createRestProvider,
  deleteProviderSecret,
  getProviderRepository,
  hasProviderSecret,
  saveProviderSecret,
} from "../providers/registry.ts";
import { DJEN_PROVIDER_ID, emptyConfig, type RestProviderConfig } from "../providers/rest/types.ts";
import { exportConfig, importConfig, validateConfig } from "../providers/rest/validation.ts";

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function todayValue(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function SourcesPage(props: {
  activeId: string;
  profiles: AttorneyProfile[];
  onActiveChange: (id: string) => void;
}) {
  const [sources, setSources] = useState<RestProviderConfig[]>([]);
  const [secured, setSecured] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<RestProviderConfig>();
  const [secret, setSecret] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [sample, setSample] = useState<Publication>();
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [removing, setRemoving] = useState<RestProviderConfig>();
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");

  const profile = props.profiles[0];
  const [testOab, setTestOab] = useState(profile?.oabNumber ?? "");
  const [testUf, setTestUf] = useState(profile?.oabUf ?? "");
  const [testDate, setTestDate] = useState(todayValue());

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    try {
      const repository = await getProviderRepository();
      const list = await repository.list();
      setSources(list);
      const marks = await Promise.all(list.map(async (item) => [item.id, await hasProviderSecret(item.id)] as const));
      setSecured(new Set(marks.filter(([, has]) => has).map(([id]) => id)));
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  function startNew() {
    setDraft(emptyConfig(`fonte-${Date.now().toString(36)}`));
    setSecret("");
    setProblems([]);
    setSample(undefined);
    setNotice(undefined);
    setError(undefined);
  }

  function startEdit(config: RestProviderConfig) {
    setDraft({ ...config });
    setSecret("");
    setProblems([]);
    setSample(undefined);
    setNotice(undefined);
    setError(undefined);
  }

  async function save() {
    if (!draft) return;
    const found = validateConfig(draft);
    setProblems(found);
    if (found.length > 0) return;

    setError(undefined);
    try {
      const repository = await getProviderRepository();
      await repository.save(draft);
      if (secret) {
        await saveProviderSecret(draft.id, secret);
        setSecret("");
      }
      setNotice(`Fonte "${draft.name}" salva. A chave, quando informada, fica no cofre do Windows.`);
      setDraft(undefined);
      await refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function test() {
    if (!draft) return;
    const found = validateConfig(draft);
    setProblems(found);
    if (found.length > 0) return;

    setTesting(true);
    setSample(undefined);
    setError(undefined);
    setNotice(undefined);
    try {
      // A chave precisa estar no cofre antes do teste, senão a requisição sai sem autenticação.
      if (secret) await saveProviderSecret(draft.id, secret);
      const provider = createRestProvider(draft);
      const result = await provider.search({
        oab: testOab,
        uf: testUf,
        startDate: testDate,
        endDate: testDate,
      });
      if (result.publications.length === 0) {
        setNotice(`A fonte respondeu, mas não devolveu publicações para ${testOab}/${testUf} em ${testDate}.`);
      } else {
        setSample(result.publications[0]);
        setNotice(`A fonte respondeu com ${result.total} resultados. Confira a amostra normalizada abaixo.`);
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    if (!removing) return;
    try {
      const repository = await getProviderRepository();
      await repository.delete(removing.id);
      await deleteProviderSecret(removing.id).catch(() => undefined);
      if (props.activeId === removing.id) props.onActiveChange(DJEN_PROVIDER_ID);
      setNotice(`Fonte "${removing.name}" removida. Seus dados locais continuam intactos.`);
      setRemoving(undefined);
      await refresh();
    } catch (reason) {
      setError(errorMessage(reason));
      setRemoving(undefined);
    }
  }

  async function copyConfig(config: RestProviderConfig) {
    const copied = await copyText(exportConfig(config));
    setNotice(copied
      ? "Configuração copiada, sem nenhuma credencial. Cole em outro computador para reaproveitar."
      : "Não foi possível copiar. Selecione e copie manualmente.");
  }

  function applyImport() {
    setError(undefined);
    try {
      const config = importConfig(importText, `fonte-${Date.now().toString(36)}`);
      setDraft(config);
      setImporting(false);
      setImportText("");
      setNotice("Configuração importada. Informe a chave, se a fonte exigir, e salve.");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <div className="page-stack sources-page">
      <header className="page-heading compact-heading">
        <div><span className="eyebrow">Fontes de dados</span><h1>De onde vêm as publicações</h1></div>
        <p>A fonte do CNJ vem pronta e não exige chave. Trocar de fonte não altera as telas de pesquisa nem o acervo já salvo.</p>
      </header>

      {error ? <div className="error-banner"><CircleAlert size={18} />{error}</div> : null}
      {notice ? <div className="source-notice"><CheckCircle2 size={17} />{notice}</div> : null}

      <section className="source-list">
        <article className={props.activeId === DJEN_PROVIDER_ID ? "source-card active" : "source-card"}>
          <Gavel size={22} />
          <div>
            <strong>DJEN / CNJ</strong>
            <small>Fonte pública oficial, sem chave e sem configuração.</small>
          </div>
          <span className="source-tag">Padrão</span>
          {props.activeId === DJEN_PROVIDER_ID
            ? <span className="source-active">Em uso</span>
            : <button className="secondary-action" onClick={() => props.onActiveChange(DJEN_PROVIDER_ID)} type="button">Usar esta fonte</button>}
        </article>

        {sources.map((source) => (
          <article className={props.activeId === source.id ? "source-card active" : "source-card"} key={source.id}>
            <Plug size={22} />
            <div>
              <strong>{source.name}</strong>
              <small>{source.baseUrl}</small>
              <small>
                {source.authMode === "none" ? "Sem autenticação" : `Autenticação: ${source.authMode}`}
                {secured.has(source.id) ? " · chave guardada no cofre do Windows" : source.authMode === "none" ? "" : " · chave ainda não informada"}
              </small>
            </div>
            <div className="source-actions">
              <button className="text-action" onClick={() => startEdit(source)} type="button">Editar</button>
              <button className="text-action" onClick={() => void copyConfig(source)} type="button">
                <Clipboard size={14} /> Copiar
              </button>
              <button aria-label="Remover fonte" className="history-remove" onClick={() => setRemoving(source)} type="button">
                <Trash2 size={15} />
              </button>
            </div>
            {props.activeId === source.id
              ? <span className="source-active">Em uso</span>
              : <button className="secondary-action" onClick={() => props.onActiveChange(source.id)} type="button">Usar esta fonte</button>}
          </article>
        ))}
      </section>

      <div className="source-toolbar">
        <button className="primary-action" onClick={startNew} type="button"><Plus size={16} /> Adicionar API REST</button>
        <button className="secondary-action" onClick={() => setImporting(!importing)} type="button">
          <ClipboardPaste size={15} /> Importar configuração
        </button>
      </div>

      {importing ? (
        <section className="import-panel">
          <label className="field">
            <span>Cole aqui a configuração copiada de outro computador</span>
            <textarea onChange={(event) => setImportText(event.target.value)} rows={6} value={importText} />
          </label>
          <p>A configuração nunca carrega a chave. Depois de importar, informe a chave desta máquina.</p>
          <button className="primary-action" disabled={!importText.trim()} onClick={applyImport} type="button">Importar</button>
        </section>
      ) : null}

      {draft ? (
        <SourceForm
          config={draft}
          onCancel={() => setDraft(undefined)}
          onChange={setDraft}
          onSave={() => void save()}
          onSecretChange={setSecret}
          onTest={() => void test()}
          problems={problems}
          sample={sample}
          secret={secret}
          secretStored={secured.has(draft.id)}
          testDate={testDate}
          testOab={testOab}
          testUf={testUf}
          testing={testing}
          onTestDateChange={setTestDate}
          onTestOabChange={setTestOab}
          onTestUfChange={setTestUf}
        />
      ) : null}

      <section className="source-note">
        <KeyRound size={19} />
        <p>
          As chaves ficam no Gerenciador de Credenciais do Windows, nunca no banco local nem na configuração
          exportada. A requisição sai do processo nativo, então a chave também não passa pela interface.
        </p>
      </section>

      <section className="source-note">
        <TriangleAlert size={19} />
        <p>
          O modo REST cobre APIs comuns. Uma fonte com autenticação ou fluxo muito específico precisa de um
          adaptador próprio no código — o repositório explica como criar um em <code>docs/adaptadores.md</code>.
        </p>
      </section>

      {removing ? (
        <ConfirmDialog
          confirmLabel="Remover a fonte"
          description={`A fonte "${removing.name}" sai da lista e a chave dela é apagada do cofre do Windows. As publicações já salvas continuam no acervo.`}
          onCancel={() => setRemoving(undefined)}
          onConfirm={() => void remove()}
          title="Remover esta fonte?"
        />
      ) : null}

      {testing ? <p className="source-testing"><LoaderCircle className="spin" size={15} /> Consultando a fonte…</p> : null}
    </div>
  );
}
