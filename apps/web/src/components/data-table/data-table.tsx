import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type DataTableFilter = {
  columnId: string;
  label: string;
  placeholder: string;
  ariaLabel?: string;
};

export type DataTableLabels = {
  empty: string;
  previousPage: string;
  nextPage: string;
  pageStatus: (page: number, pageCount: number) => string;
};

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  filters?: DataTableFilter[];
  labels: DataTableLabels;
  pageSize?: number;
  className?: string;
};

function DataTable<TData, TValue>({
  columns,
  data,
  filters = [],
  labels,
  pageSize = 10,
  className,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const table = useReactTable({
    data,
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <section className={className}>
      {filters.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-4">
          {filters.map((filter) => {
            const column = table.getColumn(filter.columnId);
            if (!column) return null;

            return (
              <div key={filter.columnId} className="grid min-w-48 flex-1 gap-2">
                <label htmlFor={`data-table-filter-${filter.columnId}`} className="text-sm font-medium">
                  {filter.label}
                </label>
                <Input
                  id={`data-table-filter-${filter.columnId}`}
                  aria-label={filter.ariaLabel ?? filter.label}
                  placeholder={filter.placeholder}
                  value={(column.getFilterValue() as string) ?? ""}
                  onChange={(event) => column.setFilterValue(event.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} colSpan={header.colSpan}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {labels.empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {labels.pageStatus(table.getState().pagination.pageIndex + 1, table.getPageCount())}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            {labels.previousPage}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {labels.nextPage}
          </Button>
        </div>
      </div>
    </section>
  );
}

export { DataTable };
