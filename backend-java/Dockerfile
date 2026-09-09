FROM maven:3.9-eclipse-temurin-17 AS build

WORKDIR /app
COPY pom.xml .
COPY mvgo-common/pom.xml mvgo-common/
COPY mvgo-data/pom.xml mvgo-data/
COPY mvgo-node/pom.xml mvgo-node/
COPY mvgo-business/pom.xml mvgo-business/
COPY mvgo-api/pom.xml mvgo-api/
COPY mvgo-app/pom.xml mvgo-app/

RUN mvn dependency:go-offline -pl mvgo-app -am

COPY . .
RUN mvn clean package -pl mvgo-app -am -DskipTests

FROM eclipse-temurin:17-jre-alpine

WORKDIR /app
COPY --from=build /app/mvgo-app/target/mvgo-app-*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
