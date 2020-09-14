# pull official base image
FROM node:slim
#FROM node:13.12.0-alpine

# set working directory
WORKDIR /app

# add `/app/node_modules/.bin` to $PATH
ENV PATH /app/node_modules/.bin:$PATH

# Copies package.json and yarn.lock to Docker environment
COPY package.json ./

RUN npm install

# Copies everything over to Docker environment
COPY . .

# Uses port which is used by the actual application
EXPOSE 13337

# Finally runs the application
CMD [ "npm", "start" ]