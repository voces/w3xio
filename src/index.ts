
import express from "express";

const port = 8080; // default port to listen

const app = express();

app.get( "/exception", ( req, res ) => {

	

	res.send( { hello: "world" } );

} );

// start the express server
app.listen( port, () => {

	// tslint:disable-next-line:no-console
	console.log( `server started at http://localhost:${ port }` );

} );
