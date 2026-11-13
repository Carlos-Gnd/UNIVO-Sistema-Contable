import * as React from "react";
import { ChevronDown, ChevronRight, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type AccountTreeItem = {
  id: string;
  codigo: string;
  nombre: string;
  nivel: number;
  cuentaPadreId: string | null;
  activa: boolean;
};

export type AccountTreeLabels = {
  title: string;
  expandAll: string;
  collapseAll: string;
  code: string;
  account: string;
  status: string;
  imputable: string;
  empty: string;
  header: string;
  detail: string;
  active: string;
  inactive: string;
  expandAccount: (name: string) => string;
  collapseAccount: (name: string) => string;
};

type AccountTreeProps = {
  accounts: AccountTreeItem[];
  labels: AccountTreeLabels;
  className?: string;
};

type AccountNode = AccountTreeItem & { children: AccountNode[] };

function buildTree(accounts: AccountTreeItem[]): AccountNode[] {
  const nodes = new Map<string, AccountNode>();
  for (const account of accounts) nodes.set(account.id, { ...account, children: [] });
  const roots: AccountNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.cuentaPadreId ? nodes.get(node.cuentaPadreId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (items: AccountNode[]) => {
    items.sort((left, right) => left.codigo.localeCompare(right.codigo, undefined, { numeric: true }));
    items.forEach((item) => sort(item.children));
  };
  sort(roots);

  // Keep malformed orphans visible rather than silently dropping them.
  const reachable = new Set<string>();
  const mark = (items: AccountNode[]) =>
    items.forEach((item) => {
      if (reachable.has(item.id)) return;
      reachable.add(item.id);
      mark(item.children);
    });
  mark(roots);
  const orphans = [...nodes.values()].filter((node) => !reachable.has(node.id));
  if (orphans.length) {
    for (const orphan of orphans) {
      orphan.children = orphan.children.filter((child) => child.id !== orphan.id);
    }
    roots.push(...orphans.filter((node) => !orphans.some((other) => other.children.includes(node))));
    sort(roots);
  }

  return roots;
}

function collectExpandableIds(nodes: AccountNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.children.length ? [node.id] : []),
    ...collectExpandableIds(node.children),
  ]);
}

function AccountTree({ accounts, labels, className }: AccountTreeProps) {
  const tree = React.useMemo(() => buildTree(accounts), [accounts]);
  const expandableIds = React.useMemo(() => collectExpandableIds(tree), [tree]);
  const rootIds = React.useMemo(
    () => tree.filter((node) => node.children.length).map((node) => node.id),
    [tree],
  );
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => new Set(rootIds));

  React.useEffect(() => {
    setExpandedIds((current) => {
      const validIds = new Set(expandableIds);
      const next = new Set([...current].filter((id) => validIds.has(id)));
      if (current.size === 0 && next.size === 0) rootIds.forEach((id) => next.add(id));
      return next;
    });
  }, [expandableIds, rootIds]);

  const toggle = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderRows = (nodes: AccountNode[], depth = 0): React.ReactNode =>
    nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const expanded = expandedIds.has(node.id);
      return (
        <React.Fragment key={node.id}>
          <TableRow aria-level={depth + 1}>
            <TableCell className="font-mono tabular-nums">{node.codigo}</TableCell>
            <TableCell>
              <div
                className="flex min-w-0 items-center gap-1"
                style={{ paddingInlineStart: `${depth * 1.25}rem` }}
              >
                {hasChildren ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={
                      expanded ? labels.collapseAccount(node.nombre) : labels.expandAccount(node.nombre)
                    }
                    aria-expanded={expanded}
                    onClick={() => toggle(node.id)}
                  >
                    {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                  </Button>
                ) : (
                  <span aria-hidden="true" className="inline-block size-6 shrink-0" />
                )}
                <span className="truncate">{node.nombre}</span>
              </div>
            </TableCell>
            <TableCell>
              {hasChildren ? (
                <span className="text-muted-foreground">{labels.header}</span>
              ) : (
                <span className="rounded-md border border-border px-2 py-0.5 text-xs">
                  {labels.imputable}
                </span>
              )}
            </TableCell>
            <TableCell>
              <span className={node.activa ? "text-foreground" : "text-muted-foreground"}>
                {node.activa ? labels.active : labels.inactive}
              </span>
            </TableCell>
          </TableRow>
          {hasChildren && expanded && renderRows(node.children, depth + 1)}
        </React.Fragment>
      );
    });

  return (
    <section className={className} aria-label={labels.title}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <FolderTree aria-hidden="true" className="size-5" />
          {labels.title}
        </h2>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setExpandedIds(new Set(expandableIds))}>
            {labels.expandAll}
          </Button>
          <Button type="button" variant="outline" onClick={() => setExpandedIds(new Set())}>
            {labels.collapseAll}
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{labels.code}</TableHead>
            <TableHead>{labels.account}</TableHead>
            <TableHead>{labels.detail}</TableHead>
            <TableHead>{labels.status}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tree.length ? (
            renderRows(tree)
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                {labels.empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}

export { AccountTree };
