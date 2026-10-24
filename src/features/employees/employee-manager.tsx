"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { ArrowButton, PillButton, StatusPill } from "@/components/ui";
import { customerApi } from "@/features/customer-ordering/public-client";
import type { Employee } from "@/features/employees/types";
import { employeeCreateSchema, employeeUpdateSchema } from "@/features/employees/validation";
import { ROLE_LABELS, type UserRole } from "@/lib/auth";

type Editor = { id: string | null; full_name: string; email: string; password: string; role: UserRole; is_active: boolean };

export function EmployeeManager({ initialEmployees, currentUserId }: { initialEmployees: Employee[]; currentUserId: string }) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const editorOpen = editor !== null, editingId = editor?.id;
  useEffect(() => { if (editorOpen) heading.current?.focus(); }, [editorOpen, editingId]);

  function upsert(employee: Employee) {
    setEmployees((current) => [...current.filter((entry) => entry.id !== employee.id), employee]);
  }
  function open(employee?: Employee) {
    setError(""); setNotice(""); setShowPassword(false);
    setEditor(employee ? { ...employee, full_name: employee.full_name ?? "", password: "" } : { id: null, full_name: "", email: "", password: "", role: "waiter", is_active: true });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || lock.current) return;
    const parsed = editor.id ? employeeUpdateSchema.safeParse({ full_name: editor.full_name, role: editor.role }) : employeeCreateSchema.safeParse({ full_name: editor.full_name, email: editor.email, password: editor.password, role: editor.role, is_active: editor.is_active });
    if (!parsed.success) { setError("Confira nome, e-mail, perfil e senha de 8 a 72 caracteres."); return; }
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await customerApi<{ employee: Employee }>(editor.id ? `/api/staff/employees/${editor.id}` : "/api/staff/employees", {
        method: editor.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      upsert(result.employee); setEditor(null); setShowPassword(false);
      setNotice(editor.id ? "Dados do funcionário atualizados." : `Funcionário cadastrado${result.employee.is_active ? " com acesso liberado" : " com acesso bloqueado"}.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível salvar. Confira a conexão."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function toggle(employee: Employee) {
    if (lock.current || employee.id === currentUserId) return;
    if (employee.is_active && !window.confirm(`Bloquear o acesso de ${employee.full_name ?? employee.email}? Os dados e pedidos anteriores serão preservados.`)) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await customerApi<{ employee: Employee }>(`/api/staff/employees/${employee.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !employee.is_active }) });
      upsert(result.employee); setNotice(result.employee.is_active ? "Acesso reativado." : "Acesso bloqueado, inclusive para operações com sessões já abertas.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível alterar o acesso."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { const result = await customerApi<{ employees: Employee[] }>("/api/staff/employees"); setEmployees(result.employees); }
    catch { setError("Não foi possível atualizar os funcionários."); }
    finally { lock.current = false; setBusy(false); }
  }
  const visible = employees.filter((employee) => `${employee.full_name ?? ""} ${employee.email}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))
    && (filter === "all" || (filter === "active" ? employee.is_active : !employee.is_active)));

  return <section className="employee-management">
    <header className="section-heading"><div><span className="eyebrow">Configurações</span><h1>Funcionários</h1><p>Contas e permissões da sua equipe.</p></div><PillButton disabled={busy} onClick={() => open()}>Cadastrar funcionário</PillButton></header>
    {error && <p role="alert" className="table-notice table-notice-error">{error}</p>}{notice && <p role="status" className="table-notice table-notice-info">{notice}</p>}
    <div className={`employee-layout ${editor ? "employee-layout-editing" : ""}`}>
      <section className="order-panel" aria-label="Equipe cadastrada"><div className="employee-filters">
        <label className="field-group">Buscar funcionário<input className="order-input" type="search" placeholder="Nome ou e-mail" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="field-group">Acesso<select className="order-input" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Todos</option><option value="active">Ativos</option><option value="blocked">Bloqueados</option></select></label><ArrowButton disabled={busy} onClick={() => void refresh()}>Atualizar</ArrowButton></div>
        {!visible.length && <p>Nenhum funcionário neste filtro.</p>}
        {visible.map((employee) => <article className="employee-row" key={employee.id}><div className="employee-copy"><h2>{employee.full_name || "Sem nome"}{employee.id === currentUserId && <small> Sua conta</small>}</h2><p>{employee.email || "Sem e-mail"}</p><div className="employee-badges"><StatusPill>{ROLE_LABELS[employee.role]}</StatusPill><StatusPill tone={employee.is_active ? "ready" : "cancelled"}>{employee.is_active ? "Ativo" : "Bloqueado"}</StatusPill></div></div>
          <div className="cashier-actions"><ArrowButton disabled={busy} onClick={() => open(employee)}>Editar</ArrowButton><button type="button" className="ghost-button" disabled={busy || employee.id === currentUserId} onClick={() => void toggle(employee)}>{employee.is_active ? "Bloquear" : "Reativar"}</button></div></article>)}
      </section>
      {editor && <form className="order-panel employee-editor" onSubmit={(event) => void save(event)}><div className="table-detail-heading"><h2 ref={heading} tabIndex={-1}>{editor.id ? "Editar funcionário" : "Novo funcionário"}</h2><ArrowButton disabled={busy} onClick={() => { setEditor(null); setShowPassword(false); }}>Cancelar</ArrowButton></div>
        <label className="field-group">Nome<input className="order-input" required minLength={2} maxLength={120} disabled={busy} autoComplete="off" value={editor.full_name} onChange={(event) => setEditor({ ...editor, full_name: event.target.value })} /></label>
        <label className="field-group">E-mail<input className="order-input" type="email" required maxLength={254} disabled={busy || !!editor.id} autoComplete="off" value={editor.email} onChange={(event) => setEditor({ ...editor, email: event.target.value })} /></label>
        {!editor.id && <><label className="field-group">Senha<input className="order-input" type={showPassword ? "text" : "password"} required minLength={8} maxLength={72} autoComplete="new-password" disabled={busy} value={editor.password} onChange={(event) => setEditor({ ...editor, password: event.target.value })} /><small>De 8 a 72 caracteres. Informe a senha ao funcionário.</small></label><label><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} /> Mostrar senha</label></>}
        <label className="field-group">Perfil de acesso<select className="order-input" disabled={busy || editor.id === currentUserId} value={editor.role} onChange={(event) => setEditor({ ...editor, role: event.target.value as UserRole })}>{(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
        {editor.role === "admin" && <p>Administradores podem configurar o restaurante, gerenciar a equipe e acessar todas as áreas.</p>}
        {editor.id === currentUserId && <p>Seu perfil de administrador e seu acesso não podem ser removidos pela sua própria conta.</p>}
        {!editor.id && <label><input type="checkbox" checked={editor.is_active} disabled={busy} onChange={(event) => setEditor({ ...editor, is_active: event.target.checked })} /> Liberar acesso ao cadastrar</label>}
        <PillButton type="submit" disabled={busy}>{busy ? "Salvando..." : editor.id ? "Salvar alterações" : "Criar conta"}</PillButton>
      </form>}
    </div>
  </section>;
}
