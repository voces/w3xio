
declare module "zql" {

type Where = string | Where
type RootWhere = Record<string, Where>

export default class ZQL {

	constructor( { query, database }: {
        // query: import( "mysql2/promise" ).Pool["query"];
        autogen: boolean;
        database: string;
        query?: ( ...args: any[] ) => any;
        populater: ( doc: Record<string, any>, field: string, value: any ) => void;
    } );

	get ready(): Promise<void>;

	select( table: string, { where, populates, limit }: {
        where: RootWhere;
        populates?: string[];
        limit?: number;
    } ): Promise<Record<string, any>[]>;

}

}
