




export class ApiResponse {
  
  constructor(statusCode, data = null, message = 'Success') {
    this.statusCode = statusCode;
    this.success = statusCode >= 200 && statusCode < 300;
    this.message = message;
    this.data = data;
  }

  
  
  

  static ok(data, message = 'OK') {
    return new ApiResponse(200, data, message);
  }

  static created(data, message = 'Created') {
    return new ApiResponse(201, data, message);
  }

  static noContent(message = 'No Content') {
    return new ApiResponse(204, null, message);
  }

  
  send(res) {
    return res.status(this.statusCode).json({
      success: this.success,
      message: this.message,
      data: this.data,
    });
  }
}

export default ApiResponse;
