
import express, { Express } from "express";
import { select, query } from "./zql.js";

const port = 8080; // default port to listen

const app = express();
// const wrap = ( fn: ( ...args: Parameters<Express["get"]> ) => Promise<ReturnType<Express["get"]>> ) =>
// ( ...args: Parameters<Express["get"]> ): ReturnType<Express["get"]> =>
// fn( ...args ).catch( args[ 2 ] );

app.get( "/exception", async ( req, res ) => {

	const ret = await query( "SELECT 1" );

	res.send( ret );

} );

// start the express server
app.listen( port, () => {

	// tslint:disable-next-line:no-console
	console.log( `server started at http://localhost:${ port }` );

} );
