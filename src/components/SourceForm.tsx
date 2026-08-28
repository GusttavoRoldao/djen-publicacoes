import { CircleAlert, LoaderCircle, Plus, TestTube2, Trash2 } from "lucide-react";
import type { Publication } from "../djen/types.ts";
import type { AuthMode, NamedValue, RestProviderConfig } from "../providers/rest/types.ts";

const AUTH_LABELS: { value: AuthMode; label: string; hint: string }[] = [
  { value: "none", label: "Sem chave", hint: "A fonte é pública." },
  { value: "header-key", label: "Chave em cabeçalho", hint: "A chave vai em um cabeçalho, como X-Api-Key." },
  { value: "query-key", label: "Chave na URL", hint: "A chave vai como parâmetro, como api_key." },
  { value: "bearer", label: "Token Bearer", hint: "A chave vai em Authorization: Bearer." },
];

const QUERY_FIELDS: { field: keyof RestProviderConfig["query"]; label: string; required: boolean }[] = [
  { field: "oab", label: "Número da OAB", required: true },
  { field: "uf", label: "UF da OAB", required: true },
  { field: "startDate", label: "Data inicial", required: true },
  { field: "endDate", label: "Data final", required: true },
  { field: "tribunal", label: "Tribunal", required: false },
  { field: "page", label: "Página", required: false },
  { field: "pageSize", label: "Itens por página", required: false },
];

const MAPPING_FIELDS: { field: keyof RestProviderConfig["mapping"]; label: string; required: boolean }[] = [
  { field: "items", label: "Lista de resultados", required: true },
  { field: "total", label: "Total de resultados", required: false },
  { field: "sourceId", label: "Identificador da publicação", required: true },
  { field: "availableOn", label: "Data de disponibilização", required: true },
  { field: "tribunal", label: "Tribunal", required: true },
  { field: "communicationType", label: "Tipo de comunicação", required: true },
  { field: "courtUnit", label: "Órgão julgador", required: true },
  { field: "processNumber", label: "Número do processo", required: true },
  { field: "text", label: "Texto integral", required: true },
  { field: "officialLink", label: "Link oficial", required: false },
  { field: "className", label: "Classe", required: false },
  { field: "documentType", label: "Tipo de documento", required: false },
  { field: "attorneys", label: "Lista de advogados", required: false },
  { field: "attorneyName", label: "Nome do advogado", required: false },
  { field: "attorneyOab", label: "OAB do advogado", required: false },
  { field: "attorneyUf", label: "UF do advogado", required: false },
  { field: "recipients", label: "Lista de partes", required: false },
  { field: "recipientName", label: "Nome da parte", required: false },
  { field: "recipientRole", label: "Polo da parte", required: false },
];

function PairList(props: {
  title: string;
  hint: string;
  pairs: NamedValue[];
  onChange: (pairs: NamedValue[]) => void;
}) {
  return (
    <div className="pair-list">
      <span className="pair-title">{props.title}<small>{props.hint}</small></span>
      {props.pairs.map((pair, index) => (
        <div className="pair-row" key={index}>
          <input
            aria-label="Nome"
            onChange={(event) => props.onChange(props.pairs.map((item, position) => (
              position === index ? { ...item, name: event.target.value } : item
            )))}
            placeholder="Nome"
            value={pair.name}
          />
          <input
            aria-label="Valor"
            onChange={(event) => props.onChange(props.pairs.map((item, position) => (
              position === index ? { ...item, value: event.target.value } : item
            )))}
            placeholder="Valor"
            value={pair.value}
          />
          <button
            aria-label="Remover"
            onClick={() => props.onChange(props.pairs.filter((_, position) => position !== index))}
            type="button"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button className="text-action" onClick={() => props.onChange([...props.pairs, { name: "", value: "" }])} type="button">
        <Plus size={14} /> Adicionar
      </button>
    </div>
  );
}

export function SourceForm(props: {
  config: RestProviderConfig;
  secret: string;
  secretStored: boolean;
  problems: string[];
  sample?: Publication;
  testing: boolean;
  testOab: string;
  testUf: string;
  testDate: string;
  onChange: (config: RestProviderConfig) => void;
  onSecretChange: (secret: string) => void;
  onTestOabChange: (value: string) => void;
  onTestUfChange: (value: string) => void;
  onTestDateChange: (value: string) => void;
  onTest: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { config } = props;
  const update = (patch: Partial<RestProviderConfig>) => props.onChange({ ...config, ...patch });
  const needsName = config.authMode === "header-key" || config.authMode === "query-key";

  return (
    <section className="source-form">
      <h2>{config.name || "Nova fonte REST"}</h2>

      {props.problems.length > 0 ? (
        <div className="form-error">
          <strong><CircleAlert size={15} /> Ajuste antes de salvar</strong>
          <ul>{props.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
        </div>
      ) : null}

      <div className="source-fieldset">
        <h3>Identidade e endereço</h3>
        <div className="form-grid">
          <label className="field"><span>Nome da fonte</span>
            <input onChange={(event) => update({ name: event.target.value })} value={config.name} />
          </label>
          <label className="field"><span>Método</span>
            <select onChange={(event) => update({ method: event.target.value as "GET" | "POST" })} value={config.method}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </label>
          <label className="field field-wide"><span>URL-base</span>
            <input
              onChange={(event) => update({ baseUrl: event.target.value })}
              placeholder="https://api.exemplo.com/v1/publicacoes"
              value={config.baseUrl}
            />
          </label>
        </div>
      </div>

      <div className="source-fieldset">
        <h3>Autenticação</h3>
        <div className="auth-options">
          {AUTH_LABELS.map((option) => (
            <label className={config.authMode === option.value ? "auth-option selected" : "auth-option"} key={option.value}>
              <input
                checked={config.authMode === option.value}
                name="auth-mode"
                onChange={() => update({ authMode: option.value })}
                type="radio"
              />
              <span><strong>{option.label}</strong><small>{option.hint}</small></span>
            </label>
          ))}
        </div>
        {config.authMode !== "none" ? (
          <div className="form-grid">
            {needsName ? (
              <label className="field"><span>{config.authMode === "header-key" ? "Nome do cabeçalho" : "Nome do parâmetro"}</span>
                <input
                  onChange={(event) => update({ authName: event.target.value })}
                  placeholder={config.authMode === "header-key" ? "X-Api-Key" : "api_key"}
                  value={config.authName ?? ""}
                />
              </label>
            ) : null}
            <label className="field"><span>Chave</span>
              <input
                autoComplete="off"
                onChange={(event) => props.onSecretChange(event.target.value)}
                placeholder={props.secretStored ? "Chave já guardada — preencha só para trocar" : "Cole a chave da fonte"}
                type="password"
                value={props.secret}
              />
            </label>
            <p className="field-note field-wide">
              A chave vai direto para o Gerenciador de Credenciais do Windows. Ela não é gravada no banco local
              nem incluída quando você copia esta configuração.
            </p>
          </div>
        ) : null}
      </div>

      <div className="source-fieldset">
        <h3>Parâmetros da consulta</h3>
        <p className="fieldset-hint">Como a fonte chama cada dado da pesquisa na URL.</p>
        <div className="mapping-grid">
          {QUERY_FIELDS.map(({ field, label, required }) => (
            <label className="field" key={field}>
              <span>{label}{required ? "" : " — opcional"}</span>
              <input
                onChange={(event) => update({ query: { ...config.query, [field]: event.target.value } })}
                value={config.query[field] ?? ""}
              />
            </label>
          ))}
          <label className="field"><span>Itens por página</span>
            <input
              max={500}
              min={1}
              onChange={(event) => update({ pageSize: Number(event.target.value) })}
              type="number"
              value={config.pageSize}
            />
          </label>
          <label className="field"><span>Primeira página</span>
            <select onChange={(event) => update({ firstPage: Number(event.target.value) })} value={config.firstPage}>
              <option value={1}>Começa em 1</option>
              <option value={0}>Começa em 0</option>
            </select>
          </label>
        </div>
      </div>

      <div className="source-fieldset">
        <h3>Mapeamento da resposta</h3>
        <p className="fieldset-hint">
          Caminho de cada campo no JSON, em notação de ponto. Use <code>dados.resultados</code> para campos
          aninhados e <code>lista.0.nome</code> para entrar em uma posição da lista.
        </p>
        <div className="mapping-grid">
          {MAPPING_FIELDS.map(({ field, label, required }) => (
            <label className="field" key={field}>
              <span>{label}{required ? "" : " — opcional"}</span>
              <input
                onChange={(event) => update({ mapping: { ...config.mapping, [field]: event.target.value } })}
                value={config.mapping[field] ?? ""}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="source-fieldset">
        <h3>Cabeçalhos e parâmetros fixos</h3>
        <PairList
          hint="Enviados em toda requisição. Não use para a chave."
          onChange={(headers) => update({ headers })}
          pairs={config.headers}
          title="Cabeçalhos"
        />
        <PairList
          hint="Acrescentados à URL, como meio=D."
          onChange={(extraParams) => update({ extraParams })}
          pairs={config.extraParams}
          title="Parâmetros fixos"
        />
      </div>

      <div className="source-fieldset">
        <h3>Testar a conexão</h3>
        <p className="fieldset-hint">A consulta usa os dados abaixo e mostra a primeira publicação já normalizada.</p>
        <div className="test-row">
          <label className="field"><span>OAB</span>
            <input onChange={(event) => props.onTestOabChange(event.target.value)} value={props.testOab} />
          </label>
          <label className="field"><span>UF</span>
            <input maxLength={2} onChange={(event) => props.onTestUfChange(event.target.value.toUpperCase())} value={props.testUf} />
          </label>
          <label className="field"><span>Data</span>
            <input onChange={(event) => props.onTestDateChange(event.target.value)} type="date" value={props.testDate} />
          </label>
          <button className="secondary-action" disabled={props.testing} onClick={props.onTest} type="button">
            {props.testing ? <><LoaderCircle className="spin" size={15} /> Testando…</> : <><TestTube2 size={15} /> Testar conexão</>}
          </button>
        </div>

        {props.sample ? (
          <div className="sample-preview">
            <span className="eyebrow">Amostra normalizada</span>
            <dl>
              <div><dt>Processo</dt><dd>{props.sample.processNumber || "—"}</dd></div>
              <div><dt>Tribunal</dt><dd>{props.sample.tribunal || "—"}</dd></div>
              <div><dt>Data</dt><dd>{props.sample.availableOn || "—"}</dd></div>
              <div><dt>Tipo</dt><dd>{props.sample.communicationType || "—"}</dd></div>
              <div><dt>Órgão</dt><dd>{props.sample.courtUnit || "—"}</dd></div>
              <div><dt>Identificador</dt><dd>{props.sample.sourceId || "—"}</dd></div>
              <div><dt>Advogados</dt><dd>{props.sample.attorneys.map((item) => `${item.name} (${item.uf} ${item.oab})`).join(" · ") || "—"}</dd></div>
            </dl>
            <p>{props.sample.text.slice(0, 400) || "Sem texto no campo mapeado."}</p>
          </div>
        ) : null}
      </div>

      <div className="form-actions">
        <button className="secondary-action" onClick={props.onCancel} type="button">Cancelar</button>
        <button className="primary-action" onClick={props.onSave} type="button">Salvar fonte</button>
      </div>
    </section>
  );
}
