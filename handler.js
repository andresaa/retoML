'use strict';
const serverless = require('serverless-http');
const express = require('express');
const app = express();
const AWS = require('aws-sdk');
const bodyParser = require('body-parser');
const {
  request,
  response
} = require('express');

const dynamoDB = new AWS.DynamoDB.DocumentClient();

app.use(bodyParser.urlencoded({
  extended: true
}));


app.get('/stats', async (request, response) => {
  try {
    let params = {
      TableName: 'stats-validation-dev',
      Key: {
        registryId: 'initial'
      }
    };
    let result = await dynamoDB.get(params).promise();
    response.send({
      count_mutant_dna: result.Item.count_mutant_dna,
      count_human_dna: result.Item.count_human_dna,
      ratio: (result.Item.count_mutant_dna / result.Item.count_human_dna)
    })
  } catch (error) {
    response.send({
      "Code": 403,
      "Message": "Forbidden",
      "error": error
    })
  }
});

app.post('/mutant', async (request, response) => {
  try {
    let data = JSON.parse(request.body.dna);
    let n = 4;
    let matchingStrings = 0;
    let dataOk = await validateGrid(data)
    if (dataOk.length > 0) {
    } else {
      let indexLimitHor = 0;
      let indexLimitVer = 0;
      let validate = false;
      let size = data.length;
      let grid = convertToGrid(data);
      do {
        let result = await testResult(grid, indexLimitHor, indexLimitVer, n);
        validate = await valida(size, result, indexLimitHor, indexLimitVer);
        indexLimitHor = validate.indexLimitHor;
        indexLimitVer = validate.indexLimitVer;
        if (validate.result === false && validate.mutant === 0) {
          await updateStatistics("count_human_dna")
          response.send('403 - Forbidden');
          break;
          //llamar dynamo y sumar 1 en humano
        } else if (validate === true) { 
          await updateStatistics("count_mutant_dna")
          response.send("HTTP 200 - OK");
          break;
        }
      }
      while (validate.result === false);
    }
  } catch (error) {
    response.send('error de la consulta');
  }
});
//
async function testResult(grid, indexLimitHor, indexLimitVer, n) {
  let matriz = await snapshot(grid, indexLimitHor, indexLimitVer, 4, 4);
  let validateTotal = principal(matriz, n);
  return validateTotal;
}
//convierte el objeto entrante en el event en una matriz
function convertToGrid(data) {
  let insert = [];
  data.map(sequence => insert.push(sequence.split('')));
  return (insert);
};
//valida que las columnas sean del mismo tamaño de las filas
async function validateGrid(data) {
  let sizeCol = data.length;
  return data.filter(line => line.length !== sizeCol);
}
//funcion que permite obtener matrices de 4x4 partiendo de la matriz inicial que llega en el evento
async function snapshot(grid, x, y, w, h) {
  return await grid.slice(y, y + h).map(a => a.slice(x, x + w));
}
//principal
async function principal(matriz, n) {
  let count = 0;
  let verticalsMatches = await validateColumns(matriz);
  if (!verticalsMatches) {
    count = verticalsMatches;
    let horizontalMatches = await validateRows(matriz);
    if (!!horizontalMatches) {
      count = count + horizontalMatches;
    } else if (count === 2) {
      return true;
    } else {
      let numberVerticalleft = await mainDiagonal(matriz, n);
      count = count + numberVerticalleft;
      if (count < 2) {
        let numberVerticalRigth = await secondaryDiagonal(matriz, n);
        count = count + numberVerticalRigth;
        if (count < 2) {
          return count;
        }
      } else {
        return true;
      }
    }
  } else {
    return true;
  }
}
//transpones las filas y las columnas y llama la funcion "validateRows"
async function validateColumns(grid) {
  let result = [];
  for (let index = 0; index < 4; index++) {
    result.push(grid.map(x => x[index]));
  }
  let validateFinish = await validateRows(result);
  return validateFinish;
}
//Valida el numero de filas en las cuales todos sus elementos son iguales
async function validateRows(grid) {
  let initialValue = 0;
  let result = grid.map(x => {
    return isEqual(x);
  });
  let summation = await result.reduce((previousValue, currentValue) =>
    previousValue + currentValue, initialValue);
  return (summation >= 2 ? true : summation);
}
//obtiene la diagonal principal y llama la funcion "isEqual"
async function mainDiagonal(grid, n) {
  let result = [];
  for (let index = 0; index < n; index++) {
    result.push(grid[index][index]);
  }
  return await isEqual(result)
}
//obtiene la diagonal segundaria y llama la funcion "isEqual"
async function secondaryDiagonal(grid, n) {
  let result = [];
  let k = n - 1;
  for (let index = 0; index < n; index++) {
    result.push(grid[index][k--]);
  }
  return await isEqual(result)
}
//Valida si los elementos del array son iguales
function isEqual(element, index, array) {
  return element.every((val, i, arr) => val === arr[0]) === true ? 1 : 0
}
async function valida(size, result, indexLimitHor, indexLimitVer) {
  if (result === true || result === 2) {
    return true;
  } else {
    let limit = size - 4;
    if (indexLimitHor < limit) {
      indexLimitHor++;
    } else if (indexLimitHor === limit && indexLimitVer < limit) {
      indexLimitVer++;
      indexLimitHor = 0;
    } else {
      return ({
        "mutant": 0,
        "result": false
      })
    }
    return ({
      "result": false,
      "indexLimitHor": indexLimitHor,
      "indexLimitVer": indexLimitVer
    });
  }
};
//Actualiza las estadisticas luego de cada validacion
async function updateStatistics(identifier) {
  try {
    let params = {
      TableName: 'stats-validation-dev',
      Key: {
        registryId: 'initial'
      }
    };
    let result = await dynamoDB.get(params).promise();
    await updateDDB(identifier, result, params)
  } catch (error) {
    return ("error al actualizar las estadisticas")
  }  
}
async function updateDDB(identifier, result, params) {
  try {
    let dataAdd = result.Item[`${identifier}`] + 1
    let name = `${identifier}`;
    let myObj = {
    };
    params.UpdateExpression = `set ${identifier} =:x`;
    params.ExpressionAttributeValues = {
      ":x": dataAdd
    }
    await dynamoDB.update(params).promise();
  } catch (error) {
    return(' al actualizar las estadisticas')
  }
}
module.exports.generic = serverless(app);