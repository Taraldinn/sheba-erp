declare module '@tanstack/react-table' {
    export type ColumnDef<T, V = unknown> = {
        id?: string;
        accessorKey?: string;
        header?: import('react').ReactNode;
        cell?: (props: { row: { original: T }, getValue: () => any }) => import('react').ReactNode;
    };
}
