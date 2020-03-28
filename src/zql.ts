
import ZQL from "zql";
import MySQL from "mysql2/promise.js";

// When populating, we don't want to overwrite values
// Note: relationship populations generally don't have an Id or corresponding field to overwrite
const populater = ( doc: Record<string, any>, field: string, value: any ): void => {

	if ( field.endsWith( "Id" ) ) {

		const populatedFieldKey = field.slice( 0, - 2 );
		doc[ populatedFieldKey ] = value;
		return;

	}

	if ( doc[ field ] )
		throw new Error( `Tried to populate over existing field '${field}' on '${doc.constructor.name}'` );

	doc[ field ] = value;

};

// We still use a normal MySQL connection
const mysql = MySQL.createPool( {
	host: "localhost",
	multipleStatements: true,
	user: "test",
	database: "test",
} );

// Query function used by ZQL
const _query = ( ...args: Parameters<MySQL.Pool["query"]> ): ReturnType<MySQL.Pool["query"]> =>
	mysql.query( ...args );

// Our ZQL, auto-generating the spec
const zql = new ZQL( {
	autogen: true,
	database: "test",
	populater,
	query: _query,
} );

export const select = async ( ...args: Parameters<ZQL["select"]> ): ReturnType<ZQL["select"]> =>
	zql.select( ...args );

export const query = mysql.query;
