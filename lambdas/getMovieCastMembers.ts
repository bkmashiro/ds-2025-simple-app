import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const ddbDocClient = createDocumentClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  try {
    console.log("Event: ", JSON.stringify(event));
    const queryParams = event.queryStringParameters;
    if (!queryParams) {
      return {
        statusCode: 500,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Missing query parameters" }),
      };
    }
    if (!queryParams.movieId) {
      return {
        statusCode: 500,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Missing movie Id parameter" }),
      };
    }
    const movieId = parseInt(queryParams?.movieId);
    let commandInput: QueryCommandInput = {
      TableName: process.env.CAST_TABLE_NAME,
    };
    if ("roleName" in queryParams) {
      commandInput = {
        ...commandInput,
        IndexName: "roleIx",
        KeyConditionExpression: "movieId = :m and begins_with(roleName, :r) ",
        ExpressionAttributeValues: {
          ":m": movieId,
          ":r": queryParams.roleName,
        },
      };
    } else if ("actorName" in queryParams) {
      commandInput = {
        ...commandInput,
        KeyConditionExpression: "movieId = :m and begins_with(actorName, :a) ",
        ExpressionAttributeValues: {
          ":m": movieId,
          ":a": queryParams.actorName,
        },
      };
    } else {
      commandInput = {
        ...commandInput,
        KeyConditionExpression: "movieId = :m",
        ExpressionAttributeValues: {
          ":m": movieId,
        },
      };
    }

    const castResult = await ddbDocClient.send(new QueryCommand(commandInput));
    const castMembers = castResult.Items?.map((item) => unmarshall(item)) || [];
    const movieCommand = new GetItemCommand({
      TableName: process.env.MOVIE_TABLE_NAME,
      Key: { movieId: { S: movieId.toString() } },
    });

    const movieResult = await ddbDocClient.send(movieCommand);
    const movieInfo = movieResult.Item ? unmarshall(movieResult.Item) : null;

    if (!movieInfo) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Movie not found" }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: movieInfo.title,
        genreIds: movieInfo.genreIds,
        overview: movieInfo.overview,
        cast: castMembers,
      }),
    };
  } catch (error: any) {
    console.log(JSON.stringify(error));
    return {
      statusCode: 500,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ error }),
    };
  }
};

function createDocumentClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  };
  const unmarshallOptions = {
    wrapNumbers: false,
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
