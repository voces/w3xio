
import MySQL from "mysql2/promise";
import ZQL from "../ZQL.js";

( async (): Promise<void> => {

	// We still use a normal MySQL connection
	const mysql = await MySQL.createConnection( {
		host: "localhost",
		multipleStatements: true,	// Multiple statements are a must!
		user: "test",
		database: "test",
	} );

	// Query function used by ZQL
	const query = ( ...args ) => mysql.query( ...args );

	// Optional mapping between MySQL's TextRow and our models; note the rows are just that, without populated fields
	// const replacer = ( row, table ) => {

	// 	if ( models[ table.name ] ) return new models[ table.name ]( row );
	// 	console.warn( "Unknown model", table );
	// 	return new Model( row );

	// };

	// When populating, we don't want to overwrite values; note relationship populations generally don't have an Id or corresponding field to overwrite
	const populater = ( doc, field, value ) => {

		if ( field.endsWith( "Id" ) ) return doc[ field.slice( 0, - 2 ) ] = value;
		if ( doc[ field ] ) throw new Error( `Tried to populate over existing field '${field}' on '${doc.constructor.name}'` );
		return doc[ field ] = value;

	};

	// Our ZQL, auto-generating the spec
	const zql = new ZQL( { query/* , format*/, autogen: true, database: "test", /* replacer,*/ populater } );

	// Make sure the spec is ready
	await zql.ready;

} )().catch( err => ( console.error( err ), process.exit( 1 ) ) );
